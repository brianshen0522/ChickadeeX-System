import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageContext } from '../contexts/PageContext';
import toast from 'react-hot-toast';
import {
  getReports,
  getReport,
  createReport,
  createReportVersion,
  generateReportPreviewStream,
  updateReportDescription
} from '../services/reportService';
import { resolveBlueLightStartUrl } from '../utils/bluelight';
import { AlertTriangle, Check, FileText, Loader2, Save, Sparkles, X } from 'lucide-react';

const BlueLightViewerPage = () => {
  const { setPageTitle, setPageDescription } = usePageContext();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const studyUIDFromQuery = params.get('StudyInstanceUID') || '';
  const patientNameFromQuery = params.get('PatientName') || '';
  const patientIdFromQuery = params.get('PatientID') || '';
  const EFFECTIVE_STUDY_UID = studyUIDFromQuery || '1.2.276.0.7230010.3.1.2.296485376.1.1521713414.1800996';

  const [version, setVersion] = useState('');
  const [reportId, setReportId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [findingText, setFindingText] = useState('');
  const [impressionText, setImpressionText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateVersion, setDuplicateVersion] = useState(null);
  const [pendingSave, setPendingSave] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [aiGeneratedContent, setAiGeneratedContent] = useState(null);
  const [isAiMode, setIsAiMode] = useState(false);
  const [viewerFrameKey, setViewerFrameKey] = useState(0);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [studyDescription, setStudyDescription] = useState('');
  const [lastSavedDescription, setLastSavedDescription] = useState('');
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [generationStages, setGenerationStages] = useState({}); // { [stage]: {stage, status, total, model} }
  const [generationTotal, setGenerationTotal] = useState(null);

  const normalizedPatientName = useMemo(() => {
    const raw = (patientNameFromQuery || '').trim();
    if (!raw) return '';
    const simplified = raw.replace(/\^/g, ' ').replace(/\s+/g, ' ').trim();
    return simplified || raw;
  }, [patientNameFromQuery]);

  const normalizedPatientId = useMemo(() => {
    const raw = (patientIdFromQuery || '').trim();
    return raw || '';
  }, [patientIdFromQuery]);

  const latestVersionNumber = useMemo(
    () => (versions.length ? versions[versions.length - 1].version_no : null),
    [versions]
  );

  const loadReport = async () => {
    try {
      setLoading(true);
      const list = await getReports({ study_instance_uid: EFFECTIVE_STUDY_UID, limit: 1, offset: 0 });
      const rep = list?.reports?.[0];
      if (rep) {
        setReportId(rep.id);
      } else {
        setReportId(null);
      }
      const fetched = rep ? await getReport(rep.id) : { versions: [] };
      const hasCustomDescription = typeof fetched.study_description === 'string';
      const normalizedDescription = hasCustomDescription
        ? fetched.study_description
        : normalizedPatientName
          ? `${normalizedPatientName} study`
          : 'BlueLight Draft';
      const normalizedReport = { ...fetched, study_description: normalizedDescription };
      setReportData(normalizedReport);
      setStudyDescription(normalizedDescription);
      setLastSavedDescription(normalizedDescription);
      setDescriptionDirty(false);
      const vers = Array.isArray(normalizedReport.versions) ? normalizedReport.versions : [];
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
      setHasUnsavedChanges(false);
      setIsAiMode(false);
    } catch (error) {
      toast.error('Failed to load report for BlueLight');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const patientTitle = normalizedPatientName ? `${normalizedPatientName} - BlueLight Viewer` : 'BlueLight Viewer';
    setPageTitle(patientTitle);
    setPageDescription('');
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientNameFromQuery, studyUIDFromQuery]);

  const onSelectVersion = (value) => {
    if (hasUnsavedChanges) {
      const confirmLeave = window.confirm('You have unsaved changes. Continue without saving?');
      if (!confirmLeave) return;
    }
    setVersion(value);
    const selected = versions.find((v) => String(v.version_no) === String(value));
    if (selected) {
      setFindingText(selected.findings || '');
      setImpressionText(selected.impression || '');
      setHasUnsavedChanges(false);
      setIsAiMode(false);
    }
  };

  const normalizeText = (text) => (text || '').trim().replace(/\s+/g, ' ').toLowerCase();

  const checkForDuplicates = (findingsDraft, impressionDraft) => {
    const currentFindings = normalizeText(findingsDraft);
    const currentImpression = normalizeText(impressionDraft);
    if (!currentFindings && !currentImpression) {
      return null;
    }
    return versions.find(
      (ver) =>
        normalizeText(ver.findings) === currentFindings &&
        normalizeText(ver.impression) === currentImpression
    ) || null;
  };

  const updateFindings = (value) => {
    setFindingText(value);
    checkForUnsavedChanges(value, impressionText);
  };

  const updateImpression = (value) => {
    setImpressionText(value);
    checkForUnsavedChanges(findingText, value);
  };

  const checkForUnsavedChanges = (findingsDraft, impressionDraft) => {
    const currentVersion = versions.find((v) => String(v.version_no) === String(version));
    if (!currentVersion) {
      setHasUnsavedChanges(Boolean(findingsDraft.trim()) || Boolean(impressionDraft.trim()));
      return;
    }
    setHasUnsavedChanges(
      (currentVersion.findings || '') !== findingsDraft ||
      (currentVersion.impression || '') !== impressionDraft
    );
  };

  const ensureReportExists = async () => {
    if (reportId) return reportId;
    const descriptionForCreate =
      (studyDescription && studyDescription.length) || (lastSavedDescription && lastSavedDescription.length)
        ? studyDescription || lastSavedDescription
        : normalizedPatientName
          ? `${normalizedPatientName} study`
          : 'BlueLight Draft';
    const created = await createReport({
      study_instance_uid: EFFECTIVE_STUDY_UID,
      patient_id: normalizedPatientId || null,
      patient_name: normalizedPatientName || 'anonymous',
      study_description: descriptionForCreate,
      modality: reportData?.modality || 'OT'
    });
    const newId = created.id;
    setReportId(newId);
    try {
      const refreshed = await getReport(newId);
      setReportData(refreshed);
      const vers = Array.isArray(refreshed.versions) ? refreshed.versions : [];
      setVersions(vers);
      const refreshedDescription =
        typeof refreshed.study_description === 'string' ? refreshed.study_description : descriptionForCreate;
      setStudyDescription(refreshedDescription);
      setLastSavedDescription(refreshedDescription);
      setDescriptionDirty(false);
    } catch (_error) {
      setVersions([]);
    }
    return newId;
  };

  const handleSaveWithDuplicateCheck = async () => {
    try {
      setLoading(true);
      const duplicate = checkForDuplicates(findingText, impressionText);
      if (duplicate) {
        setDuplicateVersion(duplicate);
        setPendingSave({ findings: findingText, impression: impressionText });
        setShowDuplicateDialog(true);
        setLoading(false);
        return;
      }
      await performSave({ findings: findingText, impression: impressionText });
    } catch (error) {
      const code = error?.response?.data?.code;
      toast.error(code === 'NO_CHANGES' ? 'No changes to save' : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const performSave = async (payload) => {
    const id = await ensureReportExists();
    const savedVersion = await createReportVersion(id, payload);
    toast.success(`Saved v${savedVersion.version_no}`);
    const refreshed = await getReport(id);
    setReportData(refreshed);
    const vers = Array.isArray(refreshed.versions) ? refreshed.versions : [];
    setVersions(vers);
    setVersion(savedVersion.version_no);
    setHasUnsavedChanges(false);
    setIsAiMode(false);
  };

  const handleContinueWithDuplicate = async () => {
    if (!pendingSave) return;
    try {
      setLoading(true);
      await performSave(pendingSave);
      setShowDuplicateDialog(false);
      setPendingSave(null);
      setDuplicateVersion(null);
    } catch (error) {
      const code = error?.response?.data?.code;
      toast.error(code === 'NO_CHANGES' ? 'No changes to save' : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSave = () => {
    setShowDuplicateDialog(false);
    setPendingSave(null);
    setDuplicateVersion(null);
  };

  const handleGenerate = async () => {
    if (!isStudyLoaded) {
      toast.error('Load a study before generating');
      return;
    }
    try {
      setLoading(true);
      setGenerationStages({});
      setGenerationTotal(null);
      const id = await ensureReportExists();

      // Try SSE stream first for real-time progress
      await new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId;
        const cleanup = generateReportPreviewStream(id, {
          onStage: (event) => {
            setGenerationStages((prev) => ({ ...prev, [event.stage]: event }));
            if (event.total) setGenerationTotal(event.total);
          },
          onResult: (aiContent) => {
            setAiGeneratedContent(aiContent);
            const findings = Array.isArray(aiContent.findings) ? aiContent.findings.join('\n') : (aiContent.findings || '');
            const impression = Array.isArray(aiContent.impression) ? aiContent.impression.join('\n') : (aiContent.impression || '');
            setFindingText(findings);
            setImpressionText(impression);
            setIsAiMode(true);
            setHasUnsavedChanges(true);
            toast.success(
              aiContent.model_config
                ? `AI content generated using ${aiContent.model_config.provider || aiContent.model_config.name}.`
                : 'AI content generated.'
            );
          },
          onError: (data) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            cleanup();
            reject(new Error(data.message || 'AI generation failed'));
          },
          onDone: () => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            cleanup();
            resolve();
          }
        });

        // Cleanup on unmount / timeout safety
        timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Generation timed out'));
        }, 600000); // 10 min timeout
      });
    } catch (error) {
      const message = error?.message || 'AI generation failed';
      // Only show error toast if we don't already have a result
      if (!isAiMode) {
        toast.error(message);
      }
    } finally {
      setLoading(false);
      setGenerationStages({});
      setGenerationTotal(null);
    }
  };

  const handleDescriptionChange = (value) => {
    setStudyDescription(value);
    setDescriptionDirty(value !== lastSavedDescription);
  };

  const handleSaveDescription = async () => {
    if (descriptionSaving || !descriptionDirty) {
      return;
    }
    try {
      setDescriptionSaving(true);
      const id = await ensureReportExists();
      const updated = await updateReportDescription(id, { study_description: studyDescription });
      setReportData((prev) => ({
        ...(prev || {}),
        ...updated,
        versions: prev?.versions || []
      }));
      const savedValue = typeof updated?.study_description === 'string' ? updated.study_description : studyDescription;
      setStudyDescription(savedValue);
      setLastSavedDescription(savedValue);
      setDescriptionDirty(false);
      toast.success('Description saved');
    } catch (error) {
      const message = error?.response?.data?.error || 'Failed to save description';
      toast.error(message);
    } finally {
      setDescriptionSaving(false);
    }
  };

  const embedUrl = useMemo(() => {
    if (!studyUIDFromQuery) {
      return '';
    }

    const baseUrl = resolveBlueLightStartUrl();
    if (!baseUrl) {
      return '';
    }

    const viewerParams = new URLSearchParams();
    viewerParams.set('StudyInstanceUID', studyUIDFromQuery);
    if (patientNameFromQuery) viewerParams.set('PatientName', patientNameFromQuery);
    if (patientIdFromQuery) viewerParams.set('PatientID', patientIdFromQuery);

    if (typeof window !== 'undefined') {
      const origin = `${window.location.protocol}//${window.location.host}`;
      viewerParams.set(
        'dicomurl',
        `${origin}/api/dicom/studies/${encodeURIComponent(studyUIDFromQuery)}/download?format=dcm`
      );
    }

    return `${baseUrl}?${viewerParams.toString()}`;
  }, [patientIdFromQuery, patientNameFromQuery, studyUIDFromQuery]);

  const isStudyLoaded = Boolean(embedUrl);
  const displayPatientName = normalizedPatientName || reportData?.patient_name || 'Unknown patient';
  const displayPatientId = normalizedPatientId || reportData?.patient_id || 'N/A';

  useEffect(() => {
    if (!embedUrl) {
      setViewerLoading(false);
      return;
    }
    setViewerLoading(true);
    setViewerFrameKey((prev) => prev + 1);
  }, [embedUrl]);

  const currentModelLabel = useMemo(() => {
    const config = aiGeneratedContent?.model_config;
    if (!config) return '';
    const customName = typeof config.name === 'string' ? config.name.trim() : '';
    return customName;
  }, [aiGeneratedContent]);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {showDuplicateDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Duplicate content detected</h3>
                <p className="text-xs text-slate-500">Matches version {duplicateVersion?.version_no}</p>
              </div>
            </div>
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The findings and impression are identical to an existing version. Do you still want to create a new version?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelSave}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinueWithDuplicate}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Patient Name</p>
            <p className="text-base font-semibold text-slate-900">{displayPatientName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Patient ID</p>
            <p className="text-base font-semibold text-slate-900">{displayPatientId}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <label htmlFor="study-description" className="text-sm font-semibold text-slate-700">
          Study Description
        </label>
        <textarea
          id="study-description"
          rows={2}
          value={studyDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Add study context for this report"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{descriptionDirty ? 'Unsaved description changes' : 'Description saved'}</span>
          <button
            type="button"
            onClick={handleSaveDescription}
            disabled={!descriptionDirty || descriptionSaving}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[0.7rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {descriptionSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save description
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,1.6fr)_420px]">
          <div className="flex h-full w-full rounded-2xl border border-slate-200 bg-black shadow-medical">
            <div className="relative flex-1">
              {viewerLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/70 text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
                  <p className="text-sm text-slate-200">Preparing viewer…</p>
                </div>
              )}
              {isStudyLoaded ? (
                <iframe
                  key={viewerFrameKey}
                  title="BlueLight Viewer"
                  src={embedUrl}
                  className={`h-full w-full border-0 transition-opacity duration-300 ${viewerLoading ? 'opacity-0' : 'opacity-100'}`}
                  allowFullScreen
                  onLoad={() => setViewerLoading(false)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
                  <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70">
                    <FileText className="h-10 w-10 text-slate-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-100">No study loaded</h2>
                  <p className="max-w-md text-sm text-slate-400">
                    Open the Studies page and click <span className="font-semibold">View</span> on a DICOM study to render it here.
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-medical">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  <select
                    aria-label="Select report version"
                    value={version || ''}
                    onChange={(e) => onSelectVersion(e.target.value)}
                    className="h-9 w-32 flex-shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!versions.length && !hasUnsavedChanges}
                  >
                    {(hasUnsavedChanges || !versions.length) && (
                      <option value="">
                        {hasUnsavedChanges ? 'Draft (unsaved)' : 'No versions'}
                      </option>
                    )}
                    {versions.map((v) => (
                      <option key={v.version_no} value={String(v.version_no)}>
                        v{v.version_no}{v.version_no === latestVersionNumber ? ' (latest)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={loading || !isStudyLoaded}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveWithDuplicateCheck}
                      disabled={!hasUnsavedChanges || loading}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-500 px-2.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                </div>
              </div>
              {(generationStages[1] || generationStages[2]) && (
                <div className="mt-1 space-y-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[0.7rem] text-slate-600">
                  {[1, 2].map((stage) => {
                    const event = generationStages[stage];
                    if (!event) {
                      return (
                        <div key={stage} className="flex items-center gap-2 opacity-50">
                          <Loader2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>Stage {stage} pending</span>
                        </div>
                      );
                    }
                    return (
                      <div key={stage} className="flex items-center gap-2">
                        {event.status === 'running' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        )}
                        <span className="truncate">
                          Stage {stage} {event.status === 'running' ? 'running' : 'complete'}
                          {generationTotal ? ` (${stage}/${generationTotal})` : ''}
                          {event.model ? ` · ${event.model}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {hasUnsavedChanges ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Unsaved changes
                  </span>
                ) : versions.length ? (
                  <span className="text-xs text-slate-500">Viewing v{version || latestVersionNumber}</span>
                ) : (
                  <span className="text-xs text-slate-400">No content saved yet</span>
                )}
                {isAiMode && currentModelLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[0.65rem] font-semibold text-purple-700">
                    <Sparkles className="h-3 w-3" />
                    AI Model: {currentModelLabel}
                  </span>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Findings</label>
                <textarea
                  className="min-h-[240px] 2xl:min-h-[360px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  value={findingText}
                  onChange={(e) => updateFindings(e.target.value)}
                  placeholder="Describe radiographic observations and clinical findings..."
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Impression</label>
                <textarea
                  className="min-h-[200px] 2xl:min-h-[300px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  value={impressionText}
                  onChange={(e) => updateImpression(e.target.value)}
                  placeholder="Summarize impression and recommendations..."
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default BlueLightViewerPage;
