import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageContext } from '../contexts/PageContext';
import toast from 'react-hot-toast';
import { getReports, getReport, createReport, createReportVersion, generateReportPreview } from '../services/reportService';
import { AlertTriangle, X, Check, Maximize2, Minimize2, Edit3, Save, Sparkles, FileText, Eye, EyeOff, RefreshCw, Columns } from 'lucide-react';

const BlueLightViewerPage = () => {
  const { setPageTitle, setPageDescription } = usePageContext();
  // Right pane state for versions and generation
  const [version, setVersion] = useState('');
  const [reportId, setReportId] = useState(null);
  const [versions, setVersions] = useState([]);
  const latest = useMemo(() => (versions.length ? versions[versions.length - 1].version_no : null), [versions]);
  const [findingText, setFindingText] = useState('');
  const [impressionText, setImpressionText] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const [isResizing, setIsResizing] = useState(false);
  const [splitPct, setSplitPct] = useState(65);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateVersion, setDuplicateVersion] = useState(null);
  const [pendingSave, setPendingSave] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState('');
  const [reportData, setReportData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [aiGeneratedContent, setAiGeneratedContent] = useState(null); // eslint-disable-line no-unused-vars
  const [isAiMode, setIsAiMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [isWideLayout, setIsWideLayout] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [viewerFrameKey, setViewerFrameKey] = useState(0);

  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const studyUIDFromQuery = params.get('StudyInstanceUID') || '';
  const patientNameFromQuery = params.get('PatientName') || '';
  const patientIdFromQuery = params.get('PatientID') || '';
  const EFFECTIVE_STUDY_UID = studyUIDFromQuery || '1.2.276.0.7230010.3.1.2.296485376.1.1521713414.1800996';

  const loadReport = async () => {
    try {
      setLoading(true);
      // Try find existing by study_instance_uid
      const list = await getReports({ study_instance_uid: EFFECTIVE_STUDY_UID, limit: 1, offset: 0 });
      let rep = list?.reports?.[0];
      if (rep) {
        setReportId(rep.id);
      } else {
        setReportId(null);
      }
      const full = rep ? await getReport(rep.id) : { versions: [] };
      setReportData(full);
      const vers = Array.isArray(full.versions) ? full.versions : [];
      setVersions(vers);
      const currentNo = vers.length ? vers[vers.length - 1].version_no : '';
      setVersion(currentNo);
      if (vers.length) {
        const sel = vers[vers.length - 1];
        setFindingText(sel.findings || '');
        setImpressionText(sel.impression || '');
      } else {
        setFindingText('');
        setImpressionText('');
      }
      setTempDescription(full.study_description || '');
    } catch (e) {
      toast.error('Failed to load report for BlueLight');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const patientTitle = patientNameFromQuery ? `${patientNameFromQuery} - BlueLight Viewer` : 'BlueLight Viewer';
    setPageTitle(patientTitle);
    setPageDescription('');
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientNameFromQuery]);

  // Resizable split handlers
  useEffect(() => {
    if (!isResizing || isFullscreen || !isWideLayout) return;
    const onMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(35, Math.min(85, (x / rect.width) * 100));
      setSplitPct(pct);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, isFullscreen, isWideLayout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsWideLayout(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isWideLayout) {
      setIsResizing(false);
    }
  }, [isWideLayout]);

  const onSelectVersion = (no) => {
    if (hasUnsavedChanges) {
      const confirm = window.confirm('You have unsaved changes. Do you want to continue and lose your changes?');
      if (!confirm) return;
    }
    
    setVersion(no);
    setIsAiMode(false);
    setAiGeneratedContent(null);
    const sel = versions.find(v => v.version_no === Number(no));
    if (sel) {
      setFindingText(sel.findings || '');
      setImpressionText(sel.impression || '');
    }
    setHasUnsavedChanges(false);
  };

  // Helper function to normalize text for comparison
  const normalizeText = (text) => {
    return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  };

  // Helper function to check for duplicate versions
  const checkForDuplicates = (findingsText, impressionText) => {
    const currentFindings = normalizeText(findingsText);
    const currentImpression = normalizeText(impressionText);
    
    // Don't check for duplicates if both fields are empty
    if (!currentFindings && !currentImpression) {
      return null;
    }
    
    // Check against ALL existing versions
    for (const version of versions) {
      const versionFindings = normalizeText(version.findings);
      const versionImpression = normalizeText(version.impression);
      
      if (currentFindings === versionFindings && currentImpression === versionImpression) {
        return version;
      }
    }
    return null;
  };

  // Track unsaved changes
  const updateFindings = (value) => {
    setFindingText(value);
    checkForUnsavedChanges(value, impressionText);
  };

  const updateImpression = (value) => {
    setImpressionText(value);
    checkForUnsavedChanges(findingText, value);
  };

  const checkForUnsavedChanges = (findings, impression) => {
    const currentVersion = versions.find(v => v.version_no === Number(version));
    if (currentVersion) {
      const hasChanges = 
        currentVersion.findings !== findings ||
        currentVersion.impression !== impression;
      setHasUnsavedChanges(hasChanges);
    } else {
      setHasUnsavedChanges(findings.trim() !== '' || impression.trim() !== '');
    }
  };

  // Handle saving with duplicate check
  const handleSaveWithDuplicateCheck = async () => {
    try {
      setLoading(true);
      
      // Check for duplicates first
      const duplicateVer = checkForDuplicates(findingText, impressionText);
      
      if (duplicateVer) {
        setDuplicateVersion(duplicateVer);
        setPendingSave({ findings: findingText, impression: impressionText });
        setShowDuplicateDialog(true);
        setLoading(false);
        return;
      }
      
      // No duplicates, proceed with save
      await performSave({ findings: findingText, impression: impressionText });
      setHasUnsavedChanges(false);
      setIsAiMode(false);
      setAiGeneratedContent(null);
    } catch (e) {
      setLoading(false);
      const code = e?.response?.data?.code;
      if (code === 'NO_CHANGES') toast.error('No changes to save'); 
      else toast.error('Save failed');
    }
  };

  // Perform the actual save operation
  const performSave = async (payload) => {
    try {
      let id = reportId;
      if (!id) {
        const created = await createReport({
          study_instance_uid: EFFECTIVE_STUDY_UID,
          patient_id: patientIdFromQuery || null,
          patient_name: patientNameFromQuery || 'anonymous',
          study_description: 'Saved from BlueLight',
          modality: 'OT'
        });
        id = created.id;
        setReportId(id);
      }
      
      if (versions.length && String(version) !== String(latest)) {
        toast('Saving as a new latest version', { icon: 'ℹ️' });
      }
      
      const v = await createReportVersion(id, payload);
      toast.success(`Saved v${v.version_no}`);
      
      // Refresh versions
      const full = await getReport(id);
      setReportData(full);
      const vers = Array.isArray(full.versions) ? full.versions : [];
      setVersions(vers);
      setVersion(v.version_no);
      setHasUnsavedChanges(false);
      setIsAiMode(false);
      setAiGeneratedContent(null);
      
      setLoading(false);
    } catch (e) {
      setLoading(false);
      throw e;
    }
  };

  // Handle duplicate dialog actions
  const handleContinueWithDuplicate = async () => {
    setShowDuplicateDialog(false);
    try {
      setLoading(true);
      await performSave(pendingSave);
      setHasUnsavedChanges(false);
      setIsAiMode(false);
      setAiGeneratedContent(null);
    } catch (e) {
      const code = e?.response?.data?.code;
      if (code === 'NO_CHANGES') toast.error('No changes to save'); 
      else toast.error('Save failed');
    }
    setPendingSave(null);
    setDuplicateVersion(null);
  };

  const handleCancelSave = () => {
    setShowDuplicateDialog(false);
    setPendingSave(null);
    setDuplicateVersion(null);
    setHasUnsavedChanges(false);
    setIsAiMode(false);
    setAiGeneratedContent(null);
    setLoading(false);
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      let id = reportId;
      if (!id) {
        const created = await createReport({
          study_instance_uid: EFFECTIVE_STUDY_UID,
          patient_id: patientIdFromQuery || null,
          patient_name: patientNameFromQuery || 'anonymous',
          study_description: 'Generated from BlueLight',
          modality: 'OT'
        });
        id = created.id;
        setReportId(id);
        // Refresh to get the new report data
        const full = await getReport(id);
        setReportData(full);
      }
      const aiContent = await generateReportPreview(id);
      
      // Only update textboxes, don't save to database yet
      setAiGeneratedContent(aiContent);
      
      // Convert arrays to text for display
      const findingsText = Array.isArray(aiContent.findings) 
        ? aiContent.findings.join('\n') 
        : (aiContent.findings || '');
      const impressionText = Array.isArray(aiContent.impression) 
        ? aiContent.impression.join('\n') 
        : (aiContent.impression || '');
        
      setFindingText(findingsText);
      setImpressionText(impressionText);
      setIsAiMode(true);
      setHasUnsavedChanges(true);
      
      // Show success with model information
      const modelInfo = aiContent.model_config;
      const successMessage = modelInfo 
        ? `AI content generated using ${modelInfo.provider} (${modelInfo.name})! Click Save to create a new version.`
        : 'AI content generated! Click Save to create a new version.';
      
      toast.success(successMessage);
    } catch (e) {
      console.error('Generate error:', e);

      const status = e?.response?.status;
      const messageSource = e?.response?.data?.error ?? e.message ?? '';
      const rawMessage = typeof messageSource === 'string'
        ? messageSource
        : (messageSource ? String(messageSource) : '');
      let errorMessage = 'AI generation failed';

      if (rawMessage.includes('No LLM models available')) {
        errorMessage = 'No AI models configured. Please ask an administrator to set up LLM models in the admin panel.';
      } else if (status === 405 || rawMessage.includes('Server error (405)')) {
        errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
      } else if (rawMessage.includes('Invalid response format')) {
        errorMessage = 'AI model returned invalid data. Please try again or contact support.';
      } else if (rawMessage.includes('Session expired')) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (rawMessage.includes('Access token required')) {
        errorMessage = 'Authentication error. Please refresh the page and try again.';
      } else if (rawMessage) {
        errorMessage = rawMessage;
      }

      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const embedUrl = useMemo(() => {
    if (!studyUIDFromQuery) return '';
    const base = 'http://localhost/bluelight/html/start.html';
    const usp = new URLSearchParams({ StudyInstanceUID: studyUIDFromQuery });
    return `${base}?${usp.toString()}`;
  }, [studyUIDFromQuery]);

  const isStudyLoaded = Boolean(embedUrl);

  const currentModelLabel = useMemo(() => {
    const config = aiGeneratedContent?.model_config;
    if (!config) return '';
    const customName = typeof config.name === 'string' ? config.name.trim() : '';
    const providerName = typeof config.provider === 'string' ? config.provider.trim() : '';
    return customName || providerName;
  }, [aiGeneratedContent]);

  const handleViewerRefresh = () => {
    if (!isStudyLoaded) {
      toast.error('No study loaded');
      return;
    }
    setViewerFrameKey((prev) => prev + 1);
  };

  const handleResetLayout = () => {
    setSplitPct(65);
  };

  const handleOpenInNewWindow = () => {
    if (!isStudyLoaded) {
      toast.error('No study loaded');
      return;
    }
    window.open(embedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSaveDescription = async () => {
    if (!reportId) {
      toast.error('No report to update');
      return;
    }
    
    try {
      setLoading(true);
      await fetch(`/api/reports/${reportId}/description`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ study_description: tempDescription })
      });
      
      // Update local state
      setReportData(prev => ({ ...prev, study_description: tempDescription }));
      setIsEditingDescription(false);
      toast.success('Description updated');
    } catch (e) {
      toast.error('Failed to update description');
    } finally {
      setLoading(false);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isFullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Duplicate Version Dialog */}
      {showDuplicateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Duplicate Content Detected</h3>
                <p className="text-sm text-gray-500">This content matches an existing version</p>
              </div>
            </div>
            
            <div className="mb-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>This version is identical to Version {duplicateVersion?.version_no}</strong>
                </p>
                <p className="text-sm text-yellow-700">
                  The findings and impression text are exactly the same as a previous version. 
                  Do you want to continue saving this as a new version anyway?
                </p>
              </div>
            </div>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={handleCancelSave}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </button>
              <button
                onClick={handleContinueWithDuplicate}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-colors"
                disabled={loading}
              >
                <Check className="h-4 w-4 mr-1.5" />
                {loading ? 'Saving...' : 'Continue Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ultra Compact Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-1.5">
        <div className="flex items-center justify-between">
          {/* Patient Info - Minimal */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-900">
              {patientNameFromQuery || 'Anonymous'}
            </span>
            <span className="text-xs text-gray-400">
              {patientIdFromQuery || 'N/A'}
            </span>
            {reportData?.finalized_at && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-600">
                Finalized
              </span>
            )}
          </div>

          {/* Description - Inline with Clear Label */}
          <div className="flex-1 mx-3 flex items-center justify-center">
            {isEditingDescription ? (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-500">Description:</span>
                <input
                  type="text"
                  className="px-2 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 w-64"
                  value={tempDescription}
                  onChange={(e) => setTempDescription(e.target.value)}
                  placeholder="Enter study description..."
                />
                <button
                  onClick={handleSaveDescription}
                  disabled={loading}
                  className="p-0.5 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <Save className="h-3 w-3" />
                </button>
                <button
                  onClick={() => {
                    setIsEditingDescription(false);
                    setTempDescription(reportData?.study_description || '');
                  }}
                  className="p-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-500">Description:</span>
                <span className="text-xs text-gray-800 truncate max-w-64" title={reportData?.study_description || 'Click to edit'}>
                  {reportData?.study_description || 'Click to edit'}
                </span>
                {reportId && !reportData?.finalized_at && (
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
                    title="Edit description"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Controls - Minimal */}
          <div className="flex items-center space-x-1">
            <button
              onClick={toggleFullscreen}
              className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs"
              title={isFullscreen ? 'Exit fullscreen (ESC)' : 'Focus mode'}
            >
              {isFullscreen ? <Minimize2 className="h-3 w-3 mr-0.5" /> : <Maximize2 className="h-3 w-3 mr-0.5" />}
              {isFullscreen ? 'Exit' : 'Focus'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area with responsive padding */}
      <div className="flex-1 min-h-0 px-2 pb-4 pt-3 sm:px-4 lg:px-5 lg:pb-5">
        {isFullscreen ? (
          /* Fullscreen Viewer Mode */
          <div className="h-full rounded-2xl border border-gray-200 bg-white shadow-lg">
            <div className="h-full p-4">
              {isStudyLoaded ? (
                <iframe
                  key={viewerFrameKey}
                  title="BlueLightViewer"
                  src={embedUrl}
                  className="h-full w-full rounded-xl border border-gray-200"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
                    <FileText className="h-8 w-8 text-gray-500" />
                  </div>
                  <p className="text-lg font-semibold text-gray-800">No Study Loaded</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose a DICOM study from the Studies page to populate the viewer.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Split View Mode */
          <div
            ref={containerRef}
            className={`flex h-full w-full transition-all ${isWideLayout ? 'flex-row gap-4' : 'flex-col gap-3'}`}
          >
            <div
              style={isWideLayout ? { width: `${splitPct}%` } : undefined}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-medical min-h-[500px]"
            >
              {/* Improved toolbar with better alignment */}
              <div className="flex-shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400">
                        Medical Imaging Viewer
                      </p>
                      <p className="text-sm font-medium text-white truncate max-w-[200px]" title={patientNameFromQuery || 'Anonymous Patient'}>
                        {patientNameFromQuery || 'Anonymous Patient'}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs">
                      <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-slate-200">
                        ID: {patientIdFromQuery || 'N/A'}
                      </span>
                      {reportData?.finalized_at && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-1 text-emerald-200 font-medium">
                          <Check className="h-3 w-3" />
                          Finalized
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleResetLayout}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      title="Reset panel layout"
                    >
                      <Columns className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Reset</span>
                    </button>
                    <button
                      onClick={handleViewerRefresh}
                      disabled={!isStudyLoaded}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-500"
                      title="Reload viewer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Reload</span>
                    </button>
                    <button
                      onClick={handleOpenInNewWindow}
                      disabled={!isStudyLoaded}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500 bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Open in new window"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Open</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Viewer viewport with proper scaling */}
              <div className="flex-1 relative bg-slate-950 overflow-hidden">
                {isStudyLoaded ? (
                  <iframe
                    key={viewerFrameKey}
                    title="BlueLightViewer"
                    src={embedUrl}
                    className="absolute inset-0 w-full h-full border-0"
                    allowFullScreen
                    style={{ minHeight: '400px' }}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-center">
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-700/50 border border-slate-600">
                      <FileText className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-200 mb-2">No Study Loaded</h3>
                    <p className="text-sm text-slate-400 max-w-sm">
                      Navigate to the Studies page to select a DICOM study for viewing
                    </p>
                    <div className="mt-4 rounded-lg bg-slate-800/50 border border-slate-700 px-4 py-2">
                      <p className="text-xs text-slate-500">
                        Viewer will display medical images here
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isWideLayout && (
              <div
                className={`flex-shrink-0 w-2 cursor-col-resize rounded-full bg-slate-200 transition-colors hover:bg-primary-300 ${isResizing ? 'bg-primary-400' : ''}`}
                onMouseDown={() => setIsResizing(true)}
                title="Drag to resize panels"
              />
            )}

            <div
              style={isWideLayout ? { width: `${100 - splitPct}%` } : undefined}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-medical min-h-[500px]"
            >
              {/* Report panel header with proper alignment */}
              <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {isAiMode && currentModelLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
                        <Sparkles className="h-3 w-3" />
                        AI • {currentModelLabel}
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-700">Version:</span>
                      <select
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        value={version}
                        onChange={(e) => onSelectVersion(e.target.value)}
                        disabled={!versions.length}
                      >
                        {versions.length === 0 && <option value="">No versions</option>}
                        {versions.map((v) => (
                          <option key={v.version_no} value={v.version_no}>
                            v{v.version_no}
                            {v.version_no === latest ? ' (latest)' : ''}
                            {v.generated_by_ai ? ' (AI)' : ''}
                          </option>
                        ))}
                      </select>
                      {versions.length > 0 && (
                        <span className="text-xs text-slate-500">
                          of {versions.length}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setCompactMode(!compactMode)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    title={compactMode ? 'Show editor' : 'Hide editor'}
                  >
                    {compactMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    <span className="hidden sm:inline">
                      {compactMode ? 'Show' : 'Hide'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Action bar with stable positioning */}
              <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-slate-600">
                      {hasUnsavedChanges ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Unsaved changes
                        </span>
                      ) : versions.length ? (
                        <span className="text-slate-500">
                          Viewing v{version || latest || 1}
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          No content saved
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:from-purple-700 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleGenerate}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span className="hidden sm:inline">Generating…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span className="hidden sm:inline">Generate</span>
                        </>
                      )}
                    </button>
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                        hasUnsavedChanges
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      onClick={handleSaveWithDuplicateCheck}
                      disabled={loading || !hasUnsavedChanges}
                    >
                      <Save className="h-4 w-4" />
                      <span className="hidden sm:inline">Save</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Content area with stable layout */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {compactMode ? (
                  <div className="flex flex-1 items-center justify-center bg-slate-50 px-6">
                    <div className="text-center">
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
                        <EyeOff className="h-4 w-4" />
                        Report editor is hidden
                      </div>
                      <p className="text-sm text-slate-500 mb-4">
                        The findings and impression editor is currently collapsed to maximize viewer space.
                      </p>
                      <button
                        onClick={() => setCompactMode(false)}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <Eye className="h-4 w-4" />
                        Show Report Editor
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-hidden bg-white">
                    <div className="h-full overflow-auto p-4">
                      <div className="grid gap-6">
                        <div>
                          <label className="mb-3 block text-sm font-semibold text-slate-700">
                            Findings
                          </label>
                          <textarea
                            className="h-60 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
                            value={findingText}
                            onChange={(e) => updateFindings(e.target.value)}
                            placeholder="Describe radiographic observations and clinical findings..."
                          />
                        </div>
                        <div>
                          <label className="mb-3 block text-sm font-semibold text-slate-700">
                            Impression
                          </label>
                          <textarea
                            className="h-44 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
                            value={impressionText}
                            onChange={(e) => updateImpression(e.target.value)}
                            placeholder="Summarize clinical impression and recommendations..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlueLightViewerPage;
