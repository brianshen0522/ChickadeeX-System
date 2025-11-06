import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  UploadCloud,
  Loader2,
  Trash2,
  Sparkles,
  Save,
  Clipboard,
  ClipboardCheck,
  FileImage,
  Film,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { usePageContext } from '../contexts/PageContext';
import {
  uploadFile,
  listUploads,
  deleteUpload,
  generateUploadReport,
  createReportFromUpload,
  saveReportVersion,
  getUploadReport
} from '../services/uploadService';
import api from '../services/api';

const formatTimestamp = (timestamp, fallback = '--') => {
  if (!timestamp) return fallback;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return fallback;
  try {
    return format(date, 'MMM d, yyyy HH:mm');
  } catch (error) {
    console.warn('Failed to format timestamp', timestamp, error);
    return fallback;
  }
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '--';
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const UploadViewerPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const [searchParams] = useSearchParams();
  const requestedUploadId = searchParams.get('uploadId');
  const requestedStudyUid = searchParams.get('studyUid');
  const navigate = useNavigate();

  const [uploads, setUploads] = useState([]);
  const [selectedUploadId, setSelectedUploadId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const [reportState, setReportState] = useState({
    reportId: null,
    versions: [],
    activeVersion: null,
    findings: '',
    impression: '',
    hasUnsavedChanges: false,
    isSaving: false,
    isGenerating: false,
    isLoading: false,
    error: null,
    lastSavedAt: null
  });

  const [viewerFrameKey, setViewerFrameKey] = useState(0);

  const [copiedStates, setCopiedStates] = useState({
    findings: false,
    impression: false
  });
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const uploadDropdownRef = useRef(null);
  const [studyTitle, setStudyTitle] = useState('');
  const [studySummary, setStudySummary] = useState('');
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteModalMessage, setDeleteModalMessage] = useState('');
  const [deleteLinkedReportId, setDeleteLinkedReportId] = useState(null);
  const [isDeletingUpload, setIsDeletingUpload] = useState(false);
  const savedIndicatorTimer = useRef(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const viewerContainerRef = useRef(null);
  const reportContainerRef = useRef(null);
  const [isWideLayout, setIsWideLayout] = useState(false);
  const viewerFlexStyle = useMemo(() => {
    if (!isWideLayout) return undefined;
    return { flexBasis: '70%', maxWidth: '70%' };
  }, [isWideLayout]);
  const reportFlexStyle = useMemo(() => {
    if (!isWideLayout) return undefined;
    return { flexBasis: '30%', maxWidth: '30%' };
  }, [isWideLayout]);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);

  const selectedUpload = useMemo(() => {
    return uploads.find((upload) => upload.id === selectedUploadId) || null;
  }, [uploads, selectedUploadId]);

  const resolvedFilename = useMemo(() => {
    if (selectedUpload?.originalFilename) {
      return selectedUpload.originalFilename;
    }
    if (studyTitle) {
      return studyTitle;
    }
    return 'Study';
  }, [selectedUpload?.originalFilename, studyTitle]);

  const splitFilename = useMemo(() => {
    if (!resolvedFilename) {
      return { base: 'Study', ext: '' };
    }
    const match = resolvedFilename.match(/(\.[^./\\]+)$/);
    if (match) {
      const basePart = resolvedFilename.slice(0, -match[1].length);
      if (basePart) {
        return {
          base: basePart,
          ext: match[1]
        };
      }
      return { base: resolvedFilename, ext: '' };
    }
    return { base: resolvedFilename, ext: '' };
  }, [resolvedFilename]);

  const canGenerate = Boolean(selectedUpload);

  const deriveDefaultTitle = useCallback((filename) => {
    if (!filename) return 'Study';
    const stripped = filename.replace(/\.[^/.]+$/, '');
    return stripped.trim() || filename;
  }, []);

  const parseStudyDescriptor = useCallback((raw, fallbackTitle) => {
    if (!raw || typeof raw !== 'string') {
      return { title: fallbackTitle, summary: '' };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : fallbackTitle;
        const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
        return { title, summary };
      }
    } catch (_error) {
      // Treat as plain string fallback
    }
    const [titlePart, ...rest] = raw.split(/\n\n/);
    const summaryFromString = rest.join('\n\n');
    const title = titlePart && titlePart.trim() ? titlePart.trim() : fallbackTitle;
    const summary = summaryFromString.trim();
    return { title, summary };
  }, []);

  useEffect(() => {
    if (!selectedUpload) {
      setStudyTitle('');
      setStudySummary('');
      setMetadataDirty(false);
      setShowSavedIndicator(false);
      return;
    }

    const originalName = selectedUpload.originalFilename || 'Study';
    const baseName = deriveDefaultTitle(originalName);
    setStudyTitle(baseName);
    setStudySummary('');
    setMetadataDirty(false);
    setShowSavedIndicator(false);
  }, [deriveDefaultTitle, selectedUpload?.id, selectedUpload?.originalFilename]);

  const viewerSrc = useMemo(() => {
    if (!selectedUpload) return '';
    if (typeof window === 'undefined') return '';

    const explicitBase = process.env.REACT_APP_BLUELIGHT_BASE_URL;
    let baseUrl;

    if (explicitBase) {
      baseUrl = explicitBase.replace(/\/+$/, '') + '/html/start.html';
    } else {
      const { protocol, hostname } = window.location;
      baseUrl = `${protocol}//${hostname}/bluelight/html/start.html`;
    }

    const params = new URLSearchParams();

    if (selectedUpload?.id) {
      params.set('uploadId', selectedUpload.id);
    }

    if (selectedUpload.isDicom) {
      if (selectedUpload.absoluteDownloadUrl) {
        params.set('dicomurl', selectedUpload.absoluteDownloadUrl);
      }
    } else {
      const imageSource = selectedUpload.absoluteDisplayUrl || selectedUpload.absoluteDownloadUrl;
      if (imageSource) {
        params.set('imageurl', imageSource);
      }
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [selectedUpload]);

  const versionsSorted = useMemo(() => {
    return [...reportState.versions].sort((a, b) => b.version_no - a.version_no);
  }, [reportState.versions]);

  const latestVersionNo = versionsSorted.length ? versionsSorted[0].version_no : null;
  const hasSavedDraft = Boolean(reportState.reportId) || versionsSorted.length > 0;
  const metadataSaveEnabled = Boolean(selectedUpload) && Boolean(studyTitle.trim());

  useEffect(() => {
    if (!viewerSrc) return;
    setViewerFrameKey((prev) => prev + 1);
  }, [viewerSrc]);

  useEffect(() => {
    return () => {
      if (savedIndicatorTimer.current) {
        clearTimeout(savedIndicatorTimer.current);
        savedIndicatorTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isUploadMenuOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsUploadMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isUploadMenuOpen]);

  useEffect(() => {
    if (!isUploadMenuOpen) return;

    const handleClickAway = (event) => {
      if (
        uploadDropdownRef.current &&
        !uploadDropdownRef.current.contains(event.target)
      ) {
        setIsUploadMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [isUploadMenuOpen]);

  useEffect(() => {
    setPageTitle('Demo');
    setPageDescription('Review demo studies with the BlueLight workspace and draft reports side by side.');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Demo', href: undefined, isCurrent: true }
    ]);
  }, [setPageTitle, setPageDescription, setBreadcrumbs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(min-width: 1280px)');
    const handleChange = (event) => setIsWideLayout(event.matches);
    setIsWideLayout(query.matches);
    query.addEventListener('change', handleChange);
    return () => {
      query.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isWideLayout) {
      if (viewerContainerRef.current) {
        viewerContainerRef.current.style.removeProperty('height');
        viewerContainerRef.current.style.removeProperty('min-height');
      }
      return;
    }

    if (
      typeof ResizeObserver === 'undefined' ||
      !reportContainerRef.current ||
      !viewerContainerRef.current
    ) {
      return;
    }

    const viewerEl = viewerContainerRef.current;

    const updateViewerHeight = () => {
      const rect = reportContainerRef.current.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.height)) return;
  viewerEl.style.height = `${rect.height}px`;
  viewerEl.style.minHeight = `${rect.height}px`;
    };

    updateViewerHeight();

    const observer = new ResizeObserver(() => {
      updateViewerHeight();
    });

    observer.observe(reportContainerRef.current);

    const handleWindowResize = () => {
      updateViewerHeight();
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (viewerEl) {
        viewerEl.style.removeProperty('height');
        viewerEl.style.removeProperty('min-height');
      }
    };
  }, [isWideLayout]);

  const refreshUploads = useCallback(async (opts = {}) => {
    setIsLoadingUploads(true);
    try {
      const response = await listUploads({ limit: 20 });
      const items = response.items || [];
      const normalizedItems = items.map((item) => ({
        ...item,
        displayTitle: deriveDefaultTitle(item.originalFilename),
        displayDescription: ''
      }));
      setUploads(normalizedItems);
      setNextCursor(response.nextCursor || null);

      if (!items.length) {
        setSelectedUploadId(null);
        return;
      }

      if (requestedUploadId && requestedUploadId !== selectedUploadId) {
        const matchById = items.find((item) => item.id === requestedUploadId);
        if (matchById) {
          setSelectedUploadId(matchById.id);
          return;
        }
      }

      if (requestedStudyUid) {
        const matchByStudy = items.find((item) => item.studyInstanceUID === requestedStudyUid);
        if (matchByStudy && matchByStudy.id !== selectedUploadId) {
          setSelectedUploadId(matchByStudy.id);
          return;
        }
      }

      if (opts.selectNewest) {
        setSelectedUploadId(items[0].id);
        return;
      }

      if (!selectedUploadId || !items.some((item) => item.id === selectedUploadId)) {
        setSelectedUploadId(items[0].id);
      }
    } catch (error) {
      toast.error('Failed to load uploads');
      console.error('Failed to refresh uploads:', error);
    } finally {
      setIsLoadingUploads(false);
    }
  }, [deriveDefaultTitle, requestedUploadId, requestedStudyUid, selectedUploadId]);

  const loadMoreUploads = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await listUploads({ cursor: nextCursor, limit: 20 });
      const appended = (response.items || []).map((item) => ({
        ...item,
        displayTitle: deriveDefaultTitle(item.originalFilename),
        displayDescription: ''
      }));
      setUploads((prev) => [...prev, ...appended]);
      setNextCursor(response.nextCursor || null);
    } catch (error) {
      toast.error('Failed to load more uploads');
      console.error('Failed to load more uploads:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [deriveDefaultTitle, isLoadingMore, nextCursor]);

  useEffect(() => {
    refreshUploads();
  }, [refreshUploads]);

  useEffect(() => {
    setIsUploadMenuOpen(false);
    if (!selectedUploadId) {
      setReportState((prev) => ({
        ...prev,
        reportId: null,
        versions: [],
        activeVersion: null,
        findings: '',
        impression: '',
        hasUnsavedChanges: false,
        isLoading: false,
        lastSavedAt: null,
        error: null
      }));
      return;
    }

    let isMounted = true;
    setReportState((prev) => ({ ...prev, isLoading: true, error: null }));

    const loadReport = async () => {
      try {
        const report = await getUploadReport(selectedUploadId);
        if (!isMounted) return;

        const defaultTitle = deriveDefaultTitle(selectedUpload?.originalFilename);
        const descriptor = report?.study_description
          ? parseStudyDescriptor(report.study_description, defaultTitle)
          : { title: defaultTitle, summary: '' };
        const normalizedTitle = descriptor.title || defaultTitle;
        const normalizedSummary = descriptor.summary || '';
        setStudyTitle(normalizedTitle);
        setStudySummary(normalizedSummary);
        setMetadataDirty(!report.id);
        setUploads((prev) =>
          prev.map((item) =>
            item.id === selectedUploadId
              ? { ...item, displayTitle: normalizedTitle, displayDescription: normalizedSummary }
              : item
          )
        );

        const versionsRaw = Array.isArray(report.versions) ? report.versions : [];
        const sortedVersions = versionsRaw.sort((a, b) => b.version_no - a.version_no);
        const latest = sortedVersions[0] || null;

        setReportState((prev) => ({
          ...prev,
          reportId: report?.id || null,
          versions: sortedVersions,
          activeVersion: latest?.version_no ?? null,
          findings: latest?.findings || '',
          impression: latest?.impression || '',
          hasUnsavedChanges: false,
          isLoading: false,
          lastSavedAt: latest?.created_at ? new Date(latest.created_at) : null
        }));
      } catch (error) {
        if (!isMounted) return;

        if (error.response?.status === 404) {
          setReportState((prev) => ({
            ...prev,
            reportId: null,
            versions: [],
            activeVersion: null,
            findings: '',
            impression: '',
            hasUnsavedChanges: false,
            isLoading: false,
            lastSavedAt: null
          }));
          const fallbackTitle = deriveDefaultTitle(selectedUpload?.originalFilename);
          setStudyTitle(fallbackTitle);
          setStudySummary('');
          setShowSavedIndicator(false);
          setMetadataDirty(true);
          setUploads((prev) =>
            prev.map((item) =>
              item.id === selectedUploadId
                ? { ...item, displayTitle: fallbackTitle, displayDescription: '' }
                : item
            )
          );
        } else {
          setReportState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Failed to load existing report'
          }));
          console.error('Failed to load existing report:', error);
          const fallbackTitle = deriveDefaultTitle(selectedUpload?.originalFilename);
          setStudyTitle(fallbackTitle);
          setStudySummary('');
          setMetadataDirty(false);
          setShowSavedIndicator(false);
        }
      }
    };

    loadReport();
    return () => {
      isMounted = false;
    };
  }, [deriveDefaultTitle, parseStudyDescriptor, selectedUpload?.originalFilename, selectedUploadId]);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    await processFiles(files);
    event.target.value = ''; // Clear the input
  };

  // Helper function to process files (shared between click and drag upload)
  const processFiles = async (files) => {
    if (!files.length) return;

    // Restrict to single file only
    if (files.length > 1) {
      toast.error('Please select only one image at a time');
      return;
    }

    const allowedTypes = ['.jpg', '.jpeg', '.png', '.webp', '.dcm', '.dicom'];
    const invalidFiles = files.filter((file) => {
      const extension = `.${file.name.toLowerCase().split('.').pop()}`;
      return !allowedTypes.includes(extension);
    });

    if (invalidFiles.length) {
      const names = invalidFiles.map((file) => file.name).join(', ');
      toast.error(`Invalid file type(s): ${names}`);
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const file of files) {
        try {
          const uploaded = await uploadFile(file);
          setUploads((prev) => {
            const filtered = prev.filter((item) => item.id !== uploaded.id);
            return [uploaded, ...filtered];
          });
          setSelectedUploadId(uploaded.id);
          successCount += 1;
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          failureCount += 1;
        }
      }

      if (successCount) {
        toast.success('Image uploaded successfully');
        refreshUploads({ selectNewest: true });
      }
      if (failureCount) {
        toast.error('Failed to upload image');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(prev => {
      const next = Math.max(prev - 1, 0);
      if (next === 0) {
        setIsDragOver(false);
      }
      return next;
    });
    if (!e.relatedTarget || !(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
      // When the pointer leaves the drop zone entirely, ensure the overlay is cleared.
      setIsDragOver(false);
      setDragDepth(0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragDepth(0);

    const files = Array.from(e.dataTransfer.files || []);
    await processFiles(files);
  };

  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setIsDragOver(false);
      setDragDepth(0);
    };

    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('drop', handleGlobalDragEnd);
    window.addEventListener('dragleave', handleGlobalDragEnd);

    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('drop', handleGlobalDragEnd);
      window.removeEventListener('dragleave', handleGlobalDragEnd);
    };
  }, []);

  const openDeleteModal = (upload, event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    setDeleteTarget(upload);
    setDeleteModalMessage(`Remove "${upload.originalFilename}" from Demo? This study will disappear from the viewer.`);
    setDeleteLinkedReportId(null);
    setDeleteModalOpen(true);
    setIsDeletingUpload(false);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
    setDeleteModalMessage('');
    setDeleteLinkedReportId(null);
    setIsDeletingUpload(false);
  };

  const confirmDeleteUpload = async () => {
    if (!deleteTarget) {
      closeDeleteModal();
      return;
    }

    if (deleteLinkedReportId) {
      closeDeleteModal();
      navigate(`/reports/${deleteLinkedReportId}`);
      return;
    }

    setIsDeletingUpload(true);

    try {
      await deleteUpload(deleteTarget.id);
      const updated = uploads.filter((upload) => upload.id !== deleteTarget.id);
      setUploads(updated);
      toast.success('Upload deleted');
      if (selectedUploadId === deleteTarget.id) {
        setSelectedUploadId(updated[0]?.id || null);
      }
      closeDeleteModal();
    } catch (error) {
      if (error.response?.status === 409) {
        const linkedReportId = error.response.data?.reportId;
        setDeleteLinkedReportId(linkedReportId || null);
        setDeleteModalMessage('This study is linked to an existing report. Open the report to manage it, or cancel to keep the upload.');
        setIsDeletingUpload(false);
      } else {
        const message = error.response?.data?.error || 'Failed to delete upload';
        toast.error(message);
        console.error('Delete failed:', error);
        setIsDeletingUpload(false);
        closeDeleteModal();
      }
    }
  };

  const ensureReportExists = async () => {
    if (reportState.reportId) {
      return reportState.reportId;
    }
    const report = await createReportFromUpload(selectedUploadId);
    return report.id;
  };

  const upsertVersionLocally = (version) => {
    setReportState((prev) => {
      const existing = prev.versions.filter((v) => v.version_no !== version.version_no);
      const versions = [...existing, version].sort((a, b) => b.version_no - a.version_no);
      return {
        ...prev,
        versions,
        activeVersion: version.version_no,
        findings: version.findings || '',
        impression: version.impression || '',
        hasUnsavedChanges: false,
        lastSavedAt: version.created_at ? new Date(version.created_at) : new Date()
      };
    });
  };

  const handleGenerate = async () => {
    if (!selectedUpload || reportState.isGenerating || !canGenerate) return;
    if (savedIndicatorTimer.current) {
      clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = null;
    }
    setShowSavedIndicator(false);
    setReportState((prev) => ({ ...prev, isGenerating: true, error: null }));

    try {
      const result = await generateUploadReport(selectedUpload.id, {
        study_description: studyTitle || selectedUpload.originalFilename,
        modality: selectedUpload.modality,
        clinical_context: studySummary || ''
      });

      const resultMessage = typeof result?.msg === 'string' ? result.msg.trim() : '';
      const generationSucceeded = result?.isSuccess !== false;

      if (!generationSucceeded) {
        const failureMessage = resultMessage || 'AI generation failed';
        setReportState((prev) => ({
          ...prev,
          isGenerating: false,
          findings: '',
          impression: '',
          hasUnsavedChanges: false,
          error: failureMessage
        }));
        toast.error(failureMessage);
        return;
      }

      const findings = Array.isArray(result.findings) ? result.findings.join('\n') : (result.findings || '');
      const impression = Array.isArray(result.impression) ? result.impression.join('\n') : (result.impression || '');

      setReportState((prev) => ({
        ...prev,
        isGenerating: false,
        findings,
        impression,
        hasUnsavedChanges: true,
        error: null
      }));
      toast.success('AI draft generated. Click Save to create a version.');
    } catch (error) {
      const message = error?.response?.data?.error || 'Failed to generate AI report';
      setReportState((prev) => ({ ...prev, isGenerating: false, error: message }));
      toast.error(message);
      console.error('AI generation failed:', error);
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedUpload) return;
    const trimmedTitle = studyTitle.trim();
    const trimmedSummary = studySummary.trim();
    if (!trimmedTitle) {
      toast.error('Study name is required');
      return;
    }

    try {
      if (savedIndicatorTimer.current) {
        clearTimeout(savedIndicatorTimer.current);
        savedIndicatorTimer.current = null;
      }
      setShowSavedIndicator(false);
      setIsMetadataSaving(true);
      let reportId = reportState.reportId;
      if (!reportId) {
        reportId = await ensureReportExists();
        setReportState((prev) => ({ ...prev, reportId }));
      }

      const descriptor = trimmedSummary ? `${trimmedTitle}\n\n${trimmedSummary}` : trimmedTitle;
      await api.put(`/reports/${reportId}/description`, {
        study_description: descriptor
      });

      setStudyTitle(trimmedTitle);
      setStudySummary(trimmedSummary);
      setMetadataDirty(false);
      setUploads((prev) =>
        prev.map((item) =>
          item.id === selectedUpload.id
            ? { ...item, displayTitle: trimmedTitle, displayDescription: trimmedSummary }
            : item
        )
      );
      setShowSavedIndicator(true);
      savedIndicatorTimer.current = setTimeout(() => {
        setShowSavedIndicator(false);
        savedIndicatorTimer.current = null;
      }, 2400);
      toast.success('Draft updated');
    } catch (error) {
      console.error('Save metadata failed:', error);
      toast.error('Failed to save study details');
    } finally {
      setIsMetadataSaving(false);
    }
  };

  const handleSaveReport = async () => {
    if (!selectedUpload || !reportState.hasUnsavedChanges || reportState.isSaving) return;

    if (savedIndicatorTimer.current) {
      clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = null;
    }
    setShowSavedIndicator(false);
    setReportState((prev) => ({ ...prev, isSaving: true, error: null }));

    try {
      let reportId = reportState.reportId;
      if (!reportId) {
        reportId = await ensureReportExists();
      }

      const saved = await saveReportVersion(selectedUpload.id, reportId, {
        findings: reportState.findings,
        impression: reportState.impression
      });

      setReportState((prev) => ({ ...prev, isSaving: false, reportId }));
      upsertVersionLocally(saved);
      if (savedIndicatorTimer.current) {
        clearTimeout(savedIndicatorTimer.current);
      }
      setShowSavedIndicator(true);
      savedIndicatorTimer.current = setTimeout(() => {
        setShowSavedIndicator(false);
        savedIndicatorTimer.current = null;
      }, 2400);
      toast.success('Report saved');
    } catch (error) {
      if (error.response?.data?.code === 'NO_CHANGES') {
        setReportState((prev) => ({
          ...prev,
          isSaving: false,
          hasUnsavedChanges: false
        }));
        toast.info('No changes to save');
      } else {
        setReportState((prev) => ({
          ...prev,
          isSaving: false,
          error: 'Failed to save report'
        }));
        toast.error('Failed to save report');
        console.error('Save failed:', error);
      }
    }
  };

  const handleFieldChange = (field, value) => {
    if (savedIndicatorTimer.current) {
      clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = null;
    }
    setShowSavedIndicator(false);
    setReportState((prev) => ({
      ...prev,
      [field]: value,
      hasUnsavedChanges: true
    }));
  };

  const handleStudyTitleChange = (value) => {
    if (savedIndicatorTimer.current) {
      clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = null;
    }
    setShowSavedIndicator(false);
    setStudyTitle(value);
    setMetadataDirty(true);
  };

  const handleStudySummaryChange = (value) => {
    if (savedIndicatorTimer.current) {
      clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = null;
    }
    setShowSavedIndicator(false);
    setStudySummary(value);
    setMetadataDirty(true);
  };

  const handleVersionChange = (event) => {
    const { value } = event.target;
    if (value === '') {
      setReportState((prev) => ({
        ...prev,
        activeVersion: null
      }));
      return;
    }

    const versionNo = Number(value);
    if (!Number.isFinite(versionNo)) return;
    const version = reportState.versions.find((v) => v.version_no === versionNo);
    if (!version) return;

    setReportState((prev) => ({
      ...prev,
      activeVersion: version.version_no,
      findings: version.findings || '',
      impression: version.impression || '',
      hasUnsavedChanges: false
    }));
  };

  const handleCopy = async (field) => {
    const text = reportState[field];
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates((prev) => ({ ...prev, [field]: true }));
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [field]: false }));
      }, 1800);
      toast.success(`${field === 'findings' ? 'Findings' : 'Impression'} copied`);
    } catch (error) {
      toast.error('Copy failed');
      console.error('Clipboard write failed:', error);
    }
  };

  const renderUploadsDropdown = (options = {}) => {
    const { fullWidth = false } = options;
    const containerClass = `relative${fullWidth ? ' w-full' : ''}`;
    const uploadButtonClass = `group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_-8px_rgba(37,99,235,0.6)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_14px_38px_-8px_rgba(37,99,235,0.7)] focus:outline-none focus:ring-4 focus:ring-blue-500/40 focus:ring-offset-2${fullWidth ? ' w-full' : ''}`;

    return (
      <div className={containerClass} ref={uploadDropdownRef}>
        <button
          type="button"
          onClick={() => setIsUploadMenuOpen((prev) => !prev)}
          aria-label="Upload images"
          aria-haspopup="menu"
          aria-expanded={isUploadMenuOpen}
          className={uploadButtonClass}
        >
          <span className="pointer-events-none absolute inset-0 bg-blue-500/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          <UploadCloud className="relative h-6 w-6" />
          <span className="relative text-base">Upload</span>
        </button>
      {isUploadMenuOpen && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Your Studies</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-blue-500">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.dcm,.dicom"
                onChange={handleUpload}
                disabled={isUploading}
                className="sr-only"
              />
            </label>
          </div>
          <div className="px-2 py-2 space-y-2">
            {isLoadingUploads ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : uploads.length ? (
              uploads.map((upload) => {
                const isActive = upload.id === selectedUploadId;
                const Icon = upload.type === 'dicom' ? Film : FileImage;
                const deleteBusy = isDeletingUpload && deleteTarget?.id === upload.id;
                return (
                  <button
                    key={upload.id}
                    type="button"
                    onClick={() => {
                      setSelectedUploadId(upload.id);
                      setIsUploadMenuOpen(false);
                      toast.dismiss();
                    }}
                    className={`group flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      isActive ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">
                        {upload.id === selectedUploadId
                          ? (studyTitle || upload.originalFilename)
                          : upload.displayTitle || upload.originalFilename}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-500">
                        <span>{upload.isDicom ? 'DICOM' : 'Image'}</span>
                        {upload.modality && <span>{upload.modality}</span>}
                        <span>{formatFileSize(upload.fileSize)}</span>
                        <span>{formatTimestamp(upload.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => openDeleteModal(upload, event)}
                      disabled={deleteBusy}
                      className={`rounded-full border p-1 transition ${
                        deleteBusy
                          ? 'border-red-200 bg-red-50 text-red-400 opacity-60'
                          : 'border-transparent text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
                      }`}
                      title="Delete upload"
                    >
                      {deleteBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </button>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                <p>No images uploaded yet.</p>
                <p className="mt-1 text-blue-600 font-medium">Click "Upload" above to add one image at a time</p>
              </div>
            )}
            {nextCursor && (
              <button
                type="button"
                onClick={loadMoreUploads}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50"
              >
                {isLoadingMore ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : 'Load more'}
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    );
  };

  const renderViewer = () => {
    if (!selectedUpload) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
            <FileImage className="h-10 w-10 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">No study selected</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Click the Upload button above or drag and drop an image anywhere on this page. DICOM and standard images will load directly in the BlueLight viewer.
          </p>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-medical">
        <div className="flex-1 h-full w-full">
          {viewerSrc ? (
            <iframe
              key={`${viewerFrameKey}-${selectedUpload.id}`}
              title="BlueLight Viewer"
              src={viewerSrc}
              className="h-full w-full border-0"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 px-6 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70">
                <FileImage className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Viewer unavailable</h3>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Unable to initialize the BlueLight session for this file. Try re-uploading or download it directly.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReportPanel = () => {
    return (
      <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-medical">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <select
              aria-label="Select report version"
              value={reportState.activeVersion != null ? String(reportState.activeVersion) : ''}
              onChange={handleVersionChange}
              className="h-9 w-32 flex-shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!versionsSorted.length && !reportState.hasUnsavedChanges}
            >
              {(reportState.hasUnsavedChanges || !versionsSorted.length) && (
                <option value="">
                  {reportState.hasUnsavedChanges ? 'Draft (unsaved)' : 'No versions'}
                </option>
              )}
              {versionsSorted.map((version) => {
                const label = `v${version.version_no}${version.version_no === latestVersionNo ? ' (latest)' : ''}`;
                return (
                  <option key={version.id} value={String(version.version_no)}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate || reportState.isGenerating}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
              title={!canGenerate ? 'Upload a study with a viewable preview to generate a draft' : 'Generate AI draft'}
            >
              {reportState.isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate
            </button>
            <button
              type="button"
              onClick={handleSaveReport}
              disabled={!reportState.hasUnsavedChanges || reportState.isSaving}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-500 px-2.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
            >
              {reportState.isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </button>
            {showSavedIndicator && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[0.65rem] font-semibold text-green-600">
                <CheckCircle2 className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>

  <div className="flex-1 px-4 py-1.5 space-y-1.5 min-h-0">
          {selectedUpload && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Study File</span>
                <div
                  className="mt-1 flex min-w-0 items-baseline gap-1 text-sm font-semibold text-slate-700"
                  title={resolvedFilename}
                >
                  <span className="truncate">{splitFilename.base}</span>
                  {splitFilename.ext && <span className="flex-shrink-0">{splitFilename.ext}</span>}
                </div>
              </div>
              {reportState.lastSavedAt && (
                <span className="mt-1 inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-600">
                  Saved {format(reportState.lastSavedAt, 'HH:mm')}
                </span>
              )}
            </div>
          )}

          {reportState.error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {reportState.error}
            </div>
          )}

          {reportState.isLoading ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="flex h-full flex-col gap-2 min-h-0">
              <section
                className="flex flex-1 flex-col gap-1.5"
                style={{ flexBasis: '38%', maxHeight: '40%' }}
              >
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Findings</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('findings')}
                    disabled={!reportState.findings}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[0.7rem] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {copiedStates.findings ? (
                      <ClipboardCheck className="h-3 w-3 text-green-600" />
                    ) : (
                      <Clipboard className="h-3 w-3" />
                    )}
                    Copy
                  </button>
                </div>
                <div
                  className="relative flex-1 overflow-hidden rounded-md border border-slate-200 bg-white transition focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-400/60"
                  style={{ minHeight: '96px' }}
                >
                  <textarea
                    value={reportState.findings}
                    onChange={(event) => handleFieldChange('findings', event.target.value)}
                    placeholder="Document clinical findings..."
                    className="h-full w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </section>

              <section
                className="flex flex-1 flex-col gap-1.5"
                style={{ flexBasis: '38%', maxHeight: '40%' }}
              >
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Impression</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('impression')}
                    disabled={!reportState.impression}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[0.7rem] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {copiedStates.impression ? (
                      <ClipboardCheck className="h-3 w-3 text-green-600" />
                    ) : (
                      <Clipboard className="h-3 w-3" />
                    )}
                    Copy
                  </button>
                </div>
                <div
                  className="relative flex-1 overflow-hidden rounded-md border border-slate-200 bg-white transition focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-400/60"
                  style={{ minHeight: '96px' }}
                >
                  <textarea
                    value={reportState.impression}
                    onChange={(event) => handleFieldChange('impression', event.target.value)}
                    placeholder="Summarize key takeaways and recommendations..."
                    className="h-full w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    );
  };

  // Show empty state when no uploads and not uploading
  const showEmptyState = uploads.length === 0 && !isUploading && !isLoadingUploads;

  // Render empty state with prominent drop zone
  const renderEmptyState = () => (
    <div className="flex h-screen flex-col items-center justify-center px-8">
      <div className="w-full max-w-2xl">
        {/* Main Drop Zone */}
        <div className="relative rounded-3xl border-4 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-100 px-12 py-20 text-center transition-all duration-300 hover:border-blue-400 hover:from-blue-100 hover:to-indigo-200">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/60 to-transparent"></div>

          <div className="relative">
            <div className="mb-6 flex justify-center">
              <UploadCloud className="h-24 w-24 text-blue-500 animate-bounce" />
            </div>

            <h1 className="mb-4 text-4xl font-bold text-slate-800">Drop Your Image Here</h1>

            <p className="mb-8 text-lg text-slate-600 max-w-md mx-auto">
              Drag and drop your medical image anywhere on this area, or use the upload button below
            </p>

            {/* Upload Button */}
            <div className="mb-6">
              <label className="group cursor-pointer inline-flex items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-10 py-5 text-xl font-bold text-white shadow-[0_12px_35px_-8px_rgba(37,99,235,0.6)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_-8px_rgba(37,99,235,0.7)] focus:outline-none focus:ring-4 focus:ring-blue-500/40 focus:ring-offset-2">
                <UploadCloud className="h-8 w-8" />
                <span>Choose Image to Upload</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.dcm,.dicom"
                  onChange={handleUpload}
                  disabled={isUploading}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Supported formats */}
            <div className="flex flex-wrap justify-center gap-3 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>JPG</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>PNG</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>WebP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>DICOM</span>
              </div>
            </div>

            <div className="mt-6 text-xs text-slate-400 max-w-sm mx-auto">
              Only one image at a time. Maximum file size: 10MB
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="mt-6 flex items-center justify-center gap-3 text-blue-600">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-lg font-medium">Uploading your image...</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen flex-col overflow-y-auto overflow-x-hidden px-5 py-2 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showEmptyState ? (
        renderEmptyState()
      ) : (
        <>
          <div className="min-h-[120px] flex-shrink-0 rounded-2xl border border-slate-200 bg-white px-6 py-3 shadow-medical">
            {hasSavedDraft && selectedUpload ? (
              <div className="space-y-3">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <label htmlFor="study-title" className="sr-only">Study Title</label>
                      <input
                        id="study-title"
                        value={studyTitle}
                        onChange={(event) => handleStudyTitleChange(event.target.value)}
                        placeholder="Study name"
                        maxLength={80}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-lg font-semibold text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="study-description" className="sr-only">Study Description</label>
                      <textarea
                        id="study-description"
                        value={studySummary}
                        onChange={(event) => handleStudySummaryChange(event.target.value)}
                        placeholder="Add a short description for this study (optional)"
                        rows={1}
                        maxLength={220}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 h-[48px]"
                      />
                      <div className="mt-0.5 flex min-h-[1rem] items-center justify-between gap-2">
                        <div className="flex-shrink-0 text-xs text-slate-500">
                          {studySummary && `${studySummary.length}/220 characters`}
                        </div>
                        <div className="flex-shrink-0">
                          {metadataDirty && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Unsaved changes
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 xl:ml-auto xl:w-[220px]">
                    {renderUploadsDropdown({ fullWidth: true })}
                    <button
                      type="button"
                      onClick={handleSaveMetadata}
                      disabled={!metadataSaveEnabled || isMetadataSaving}
                      aria-label="Save report metadata"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isMetadataSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>Save Report</span>
                    </button>
                    <div className="min-h-[1rem]" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <label htmlFor="study-title-new" className="sr-only">Study Title</label>
                      <input
                        id="study-title-new"
                        value={studyTitle}
                        onChange={(event) => handleStudyTitleChange(event.target.value)}
                        placeholder="Study name"
                        maxLength={80}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-lg font-semibold text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="study-description-new" className="sr-only">Study Description</label>
                      <textarea
                        id="study-description-new"
                        value={studySummary}
                        onChange={(event) => handleStudySummaryChange(event.target.value)}
                        placeholder="Add a short description for this study (optional)"
                        rows={1}
                        maxLength={220}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 h-[48px]"
                      />
                      <div className="mt-0.5 flex min-h-[1rem] items-center justify-between gap-2">
                        <div className="flex-shrink-0 text-xs text-slate-500">
                          {studySummary && `${studySummary.length}/220 characters`}
                        </div>
                        <div className="flex-shrink-0">
                          {metadataDirty && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Unsaved changes
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 xl:ml-auto xl:w-[220px]">
                    {renderUploadsDropdown({ fullWidth: true })}
                    <button
                      type="button"
                      onClick={handleSaveMetadata}
                      disabled={!metadataSaveEnabled || isMetadataSaving}
                      aria-label="Save report metadata"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isMetadataSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>Save Report</span>
                    </button>
                    <div className="min-h-[1rem]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-1 flex-1 min-h-0 flex flex-col xl:flex-row gap-3">
            <div
              ref={viewerContainerRef}
              className="flex-1 min-h-[320px] xl:min-h-0 flex items-stretch"
              style={viewerFlexStyle}
            >
              {renderViewer()}
            </div>
            <div
              ref={reportContainerRef}
              className="flex-1 min-h-[320px] xl:min-h-0 flex items-stretch"
              style={reportFlexStyle}
            >
              {renderReportPanel()}
            </div>
          </div>
        </>
      )}

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!isDeletingUpload) closeDeleteModal();
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {deleteLinkedReportId ? 'Linked report detected' : 'Remove study'}
              </h3>
            </div>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2">
              <p>
                {deleteModalMessage || (deleteTarget ? `Remove "${deleteTarget.originalFilename}" from Demo?` : '')}
              </p>
              {deleteLinkedReportId && (
                <p className="text-xs text-slate-500">
                  This study is attached to a report. Open the report to manage it, or cancel to keep the upload.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeletingUpload}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUpload}
                disabled={isDeletingUpload && !deleteLinkedReportId}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  deleteLinkedReportId
                    ? 'border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 focus:ring-blue-300'
                    : 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 focus:ring-rose-300'
                } ${isDeletingUpload && !deleteLinkedReportId ? 'opacity-60' : ''}`}
              >
                {deleteLinkedReportId ? (
                  <>
                    <FileText className="h-4 w-4" />
                    View report
                  </>
                ) : isDeletingUpload ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag and Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-600/90 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center rounded-2xl border-4 border-dashed border-white/70 bg-blue-700/50 px-12 py-16 text-center">
            <UploadCloud className="h-16 w-16 text-white mb-4 animate-bounce" />
            <h3 className="text-2xl font-bold text-white mb-2">Drop Your Image Here</h3>
            <p className="text-blue-100 text-lg max-w-md">
              Release to upload your image. Only one image at a time is allowed.
            </p>
            <div className="mt-4 flex items-center gap-2 text-blue-200">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-sm">JPG, PNG, WebP, DICOM supported</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadViewerPage;
