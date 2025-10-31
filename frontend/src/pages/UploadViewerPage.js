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
  LayoutList
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

  const selectedUpload = useMemo(() => {
    return uploads.find((upload) => upload.id === selectedUploadId) || null;
  }, [uploads, selectedUploadId]);

  const viewerSrc = useMemo(() => {
    if (!selectedUpload) return '';
    if (typeof window === 'undefined') return '';

    const { protocol, hostname } = window.location;
    const baseUrl = `${protocol}//${hostname}/bluelight/html/start.html`;
    const params = new URLSearchParams();

    if (selectedUpload?.id) {
      params.set('uploadId', selectedUpload.id);
    }

    if (selectedUpload.isDicom) {
      if (selectedUpload.absoluteDownloadUrl) {
        params.set('dicomurl', selectedUpload.absoluteDownloadUrl);
      }
      const previewUrl = selectedUpload.absoluteDisplayUrl;
      if (previewUrl) {
        params.set('imageurl', previewUrl);
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

  useEffect(() => {
    if (!viewerSrc) return;
    setViewerFrameKey((prev) => prev + 1);
  }, [viewerSrc]);

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

  const refreshUploads = useCallback(async (opts = {}) => {
    setIsLoadingUploads(true);
    try {
      const response = await listUploads({ limit: 20 });
      const items = response.items || [];
      setUploads(items);
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
  }, [requestedUploadId, requestedStudyUid, selectedUploadId]);

  const loadMoreUploads = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await listUploads({ cursor: nextCursor, limit: 20 });
      setUploads((prev) => [...prev, ...(response.items || [])]);
      setNextCursor(response.nextCursor || null);
    } catch (error) {
      toast.error('Failed to load more uploads');
      console.error('Failed to load more uploads:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore]);

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

        const versionsRaw = Array.isArray(report.versions) ? report.versions : [];
        const sortedVersions = versionsRaw.sort((a, b) => b.version_no - a.version_no);
        const latest = sortedVersions[0] || null;

        setReportState((prev) => ({
          ...prev,
          reportId: report.id || null,
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
        } else {
          setReportState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Failed to load existing report'
          }));
          console.error('Failed to load existing report:', error);
        }
      }
    };

    loadReport();
    return () => {
      isMounted = false;
    };
  }, [selectedUploadId]);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const allowedTypes = ['.jpg', '.jpeg', '.png', '.webp', '.dcm', '.dicom'];
    const invalidFiles = files.filter((file) => {
      const extension = `.${file.name.toLowerCase().split('.').pop()}`;
      return !allowedTypes.includes(extension);
    });

    if (invalidFiles.length) {
      const names = invalidFiles.map((file) => file.name).join(', ');
      toast.error(`Invalid file type(s): ${names}`);
      event.target.value = '';
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
        toast.success(`${successCount} file(s) uploaded`);
        refreshUploads({ selectNewest: true });
      }
      if (failureCount) {
        toast.error(`${failureCount} file(s) failed to upload`);
      }
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async (uploadId, event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    try {
      await deleteUpload(uploadId);
      const updated = uploads.filter((upload) => upload.id !== uploadId);
      setUploads(updated);
      toast.success('Upload deleted');
      if (selectedUploadId === uploadId) {
        setSelectedUploadId(updated[0]?.id || null);
      }
    } catch (error) {
      if (error.response?.status === 409) {
        const linkedReportId = error.response.data?.reportId;
        toast.custom((t) => (
          <div className="max-w-sm rounded-md border border-slate-200 bg-white p-3 shadow-lg">
            <p className="text-sm font-semibold text-slate-900">Linked report detected</p>
            <p className="mt-1 text-xs text-slate-600">
              Delete the associated report before removing this study from Demo.
            </p>
            {linkedReportId && (
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  navigate(`/reports/${linkedReportId}`);
                }}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition"
              >
                View linked report
              </button>
            )}
          </div>
        ), { duration: 6000 });
        return;
      }
      toast.error('Failed to delete upload');
      console.error('Delete failed:', error);
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
    if (!selectedUpload || reportState.isGenerating) return;
    setReportState((prev) => ({ ...prev, isGenerating: true, error: null }));

    try {
      const result = await generateUploadReport(selectedUpload.id, {
        study_description: selectedUpload.originalFilename,
        modality: selectedUpload.modality,
        clinical_context: ''
      });

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
      setReportState((prev) => ({ ...prev, isGenerating: false, error: 'Failed to generate AI report' }));
      toast.error('Failed to generate AI report');
      console.error('AI generation failed:', error);
    }
  };

  const handleSaveReport = async () => {
    if (!selectedUpload || !reportState.hasUnsavedChanges || reportState.isSaving) return;

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
    setReportState((prev) => ({
      ...prev,
      [field]: value,
      hasUnsavedChanges: true
    }));
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

  const renderUploadsDropdown = () => (
    <div className="relative" ref={uploadDropdownRef}>
      <button
        type="button"
        onClick={() => setIsUploadMenuOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
      >
        <LayoutList className="h-4 w-4" />
        {selectedUpload ? 'Change study' : 'Select a study'}
      </button>
      {isUploadMenuOpen && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Uploads</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-blue-500">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
              <input
                type="file"
                multiple
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
                return (
                  <button
                    key={upload.id}
                    type="button"
                    onClick={() => {
                      setSelectedUploadId(upload.id);
                      setIsUploadMenuOpen(false);
                    }}
                    className={`group flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      isActive ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">{upload.originalFilename}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-500">
                        <span>{upload.isDicom ? 'DICOM' : 'Image'}</span>
                        {upload.modality && <span>{upload.modality}</span>}
                        <span>{formatFileSize(upload.fileSize)}</span>
                        <span>{formatTimestamp(upload.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => handleDelete(upload.id, event)}
                      className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                No uploads yet.
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

  const renderViewer = () => {
    if (!selectedUpload) {
      return (
        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
            <FileImage className="h-10 w-10 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">No study selected</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Use the Uploads menu above to choose a study. DICOM and standard images will load directly in the BlueLight viewer.
          </p>
        </div>
      );
    }

    return (
      <div className="relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-medical">
        <div className="absolute inset-0">
          {viewerSrc ? (
            <iframe
              key={`${viewerFrameKey}-${selectedUpload.id}`}
              title="BlueLight Viewer"
              src={viewerSrc}
              className="h-full w-full border-0"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-slate-900 px-6 text-center">
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
      <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-medical">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Version</span>
            <select
              value={reportState.activeVersion != null ? String(reportState.activeVersion) : ''}
              onChange={handleVersionChange}
              className="h-8 min-w-[160px] rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!versionsSorted.length && !reportState.hasUnsavedChanges}
            >
              {(reportState.hasUnsavedChanges || !versionsSorted.length) && (
                <option value="">
                  {reportState.hasUnsavedChanges ? 'Current draft (unsaved)' : 'No versions yet'}
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

          {reportState.lastSavedAt && (
            <span className="text-xs text-slate-400">
              Saved {format(reportState.lastSavedAt, 'HH:mm')}
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!selectedUpload || reportState.isGenerating}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
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
              className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-500 px-3 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
            >
              {reportState.isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {selectedUpload && (
            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">{selectedUpload.originalFilename}</span>
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
            <>
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
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
                <textarea
                  value={reportState.findings}
                  onChange={(event) => handleFieldChange('findings', event.target.value)}
                  placeholder="Document clinical findings..."
                  className="min-h-[10rem] w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
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
                <textarea
                  value={reportState.impression}
                  onChange={(event) => handleFieldChange('impression', event.target.value)}
                  placeholder="Summarize key takeaways and recommendations..."
                  className="min-h-[8rem] w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </section>
            </>
          )}
        </div>
      </aside>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-medical">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Demo
          </span>
          <span>Select a study to preview</span>
        </div>
        <div className="flex items-center gap-3">
          {renderUploadsDropdown()}
        </div>
      </div>

      <div className="mt-4 grid h-full gap-5 lg:grid-cols-[minmax(0,1fr),420px]">
        <div className="h-full">
          {renderViewer()}
        </div>
        <div className="h-full">
          {renderReportPanel()}
        </div>
      </div>
    </div>
  );
};

export default UploadViewerPage;
