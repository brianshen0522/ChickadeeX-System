import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  getReport, 
  finalizeReport, 
  deleteReport 
} from '../services/reportService';
import { 
  ArrowLeft, 
  Edit, 
  Sparkles, 
  CheckCircle, 
  Clock,
  Download,
  FileText,
  Shield,
  Copy,
  Trash2,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { resolveBlueLightStartUrl } from '../utils/bluelight';

const ReportDetailPage = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerFrameKey, setViewerFrameKey] = useState(0);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [selectedVersionNo, setSelectedVersionNo] = useState(null);

  const canEdit = ['doctor', 'observer'].includes(user?.role);
  const canFinalize = ['doctor', 'observer'].includes(user?.role);
  const canExport = ['doctor', 'researcher'].includes(user?.role);
  const canDelete = ['doctor', 'observer'].includes(user?.role);

  useEffect(() => {
    fetchReport();
  }, [reportId]);

  const fetchReport = async () => {
    try {
      const data = await getReport(reportId);
      setReport(data);
      
      if (data.versions && data.versions.length > 0) {
        const latest = data.versions[data.versions.length - 1];
        setSelectedVersionNo(String(latest.version_no));
      } else {
        setSelectedVersionNo(null);
      }
    } catch (error) {
      toast.error('Failed to load report');
      navigate('/reports');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await finalizeReport(reportId);
      toast.success('Report finalized successfully!');
      setShowConfirmDialog(false);
      fetchReport();
    } catch (error) {
      toast.error('Failed to finalize report');
    } finally {
      setFinalizing(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await deleteReport(reportId);
      toast.success('Report deleted');
      setDeleteDialogOpen(false);
      navigate('/reports');
    } catch (error) {
      const message = error?.response?.data?.error || 'Failed to delete report';
      toast.error(message);
      console.error('Delete report failed:', error);
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const latestVersion = report?.versions?.[report.versions?.length - 1] || null;
  const viewingVersion = useMemo(() => {
    if (!report?.versions || !report.versions.length) return null;
    if (!selectedVersionNo) return report.versions[report.versions.length - 1];
    return report.versions.find((v) => String(v.version_no) === String(selectedVersionNo)) ||
      report.versions[report.versions.length - 1];
  }, [report?.versions, selectedVersionNo]);
  const bluelightEmbedUrl = useMemo(() => {
    if (!report?.study_instance_uid) return '';
    const baseUrl = resolveBlueLightStartUrl();
    if (!baseUrl) return '';

    const params = new URLSearchParams();
    params.set('StudyInstanceUID', report.study_instance_uid);
    if (report.patient_name) params.set('PatientName', report.patient_name);
    if (report.patient_id) params.set('PatientID', report.patient_id);

    if (user?.role === 'doctor') {
      if (typeof window !== 'undefined') {
        const origin = `${window.location.protocol}//${window.location.host}`;
        params.set(
          'dicomurl',
          `${origin}/api/dicom/studies/${encodeURIComponent(report.study_instance_uid)}/download?format=dcm`
        );
      }
    } else if (user?.role === 'observer') {
      if (report?.preview_image_url) {
        params.set('imageurl', report.preview_image_url);
      } else if (report?.preview_upload_id && typeof window !== 'undefined') {
        const origin = `${window.location.protocol}//${window.location.host}`;
        params.set('imageurl', `${origin}/api/uploads/${report.preview_upload_id}/converted`);
      }
    }

    return `${baseUrl}?${params.toString()}`;
  }, [report?.study_instance_uid, report?.patient_id, report?.patient_name, report?.preview_image_url, report?.preview_upload_id, user?.role]);

  useEffect(() => {
    if (!bluelightEmbedUrl) {
      setViewerLoading(false);
      return;
    }
    setViewerLoading(true);
    setViewerFrameKey((prev) => prev + 1);
  }, [bluelightEmbedUrl]);

  const handleCopyStudyUid = useCallback(async () => {
    if (!report?.study_instance_uid) {
      toast.error('Study UID unavailable');
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report.study_instance_uid);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = report.study_instance_uid;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } else {
        throw new Error('Clipboard not available');
      }
      toast.success('Study UID copied');
    } catch (error) {
      console.error('Failed to copy Study UID', error);
      toast.error('Copy failed');
    }
  }, [report?.study_instance_uid]);

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-100 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
        Report not found
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto h-full overflow-y-auto px-2">
      {/* Compact Header */}
      <div className="mb-4 mt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <button
            onClick={() => navigate('/reports')}
            className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Reports
          </button>
          
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {canExport && report.finalized_at && (
              <button
                onClick={() => toast.success('Export feature will be implemented')}
                className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </button>
            )}

            {canEdit && !report.finalized_at && (
              <button
                onClick={() => {
                  if (user?.role === 'observer') {
                    if (report?.preview_upload_id) {
                      navigate(`/demo?uploadId=${report.preview_upload_id}`);
                    } else {
                      toast.error('Source upload not available');
                    }
                    return;
                  }
                  if (!report?.study_instance_uid) {
                    toast.error('Study UID missing for this report');
                    return;
                  }
                  const viewerParams = new URLSearchParams();
                  viewerParams.set('StudyInstanceUID', report.study_instance_uid);
                  if (report.patient_name) viewerParams.set('PatientName', report.patient_name);
                  if (report.patient_id) viewerParams.set('PatientID', report.patient_id);
                  navigate(`/bluelight?${viewerParams.toString()}`);
                }}
                className="inline-flex items-center px-3 py-1.5 border border-blue-200 text-sm font-medium rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <Edit className="h-4 w-4 mr-1.5" />
                Edit Draft
              </button>
            )}

            {canDelete && !report.finalized_at && (
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="inline-flex items-center px-3 py-1.5 border border-rose-200 text-sm font-medium rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400 transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete report
              </button>
            )}
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                report.finalized_at ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
              }`}>
                {report.finalized_at ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
              </div>
              
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {report.patient_name || `Patient ${report.patient_id}`}
                </h1>
                <div className={`text-sm ${report.finalized_at ? 'text-green-600' : 'text-yellow-600'}`}>
                  {report.finalized_at ? 'Completed' : 'In Progress'}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <code className="px-2 py-1 bg-gray-100 rounded font-mono select-all">
                {report.study_instance_uid.substring(0, 20)}...
              </code>
              <button
                className="inline-flex items-center px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={async () => { 
                  try { 
                    await navigator.clipboard.writeText(report.study_instance_uid); 
                    toast.success('UID copied'); 
                  } catch { 
                    toast.error('Copy failed'); 
                  } 
                }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 pb-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {/* Compact Study Information */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-700 mb-3">Study Information</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500 font-medium">Patient ID</dt>
                <dd className="text-gray-900 font-mono mt-1">{report.patient_id || '—'}</dd>
              </div>
              
              {report.patient_name && (
                <div>
                  <dt className="text-gray-500 font-medium">Name</dt>
                  <dd className="text-gray-900 mt-1">{report.patient_name}</dd>
                </div>
              )}
              
              {report.study_date && (
                <div>
                  <dt className="text-gray-500 font-medium">Date</dt>
                  <dd className="text-gray-900 mt-1">
                    {format(new Date(report.study_date), 'MMM dd, yyyy')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 font-medium">Study UID</dt>
                <dd className="mt-1 flex items-center gap-2 font-mono text-xs text-gray-900">
                  {report.study_instance_uid || 'Unavailable'}
                  {report.study_instance_uid && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[0.65rem] text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onClick={handleCopyStudyUid}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </dd>
              </div>
            </div>
            
            {report.study_description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <dt className="text-gray-500 font-medium text-sm">Description</dt>
                <dd className="text-gray-900 text-sm mt-1">{report.study_description}</dd>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">BlueLight Viewer</p>
                <p className="text-xs text-gray-500">
                  Embedded study view
                </p>
              </div>
              {viewerLoading && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading
                </span>
              )}
            </div>
            <div className="relative h-[640px] bg-black">
              {bluelightEmbedUrl ? (
                <>
                  {viewerLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-200" />
                      <span className="text-xs text-gray-100">Preparing viewer…</span>
                    </div>
                  )}
                  <iframe
                    key={viewerFrameKey}
                    title="BlueLight Viewer"
                    src={bluelightEmbedUrl}
                    className={`h-full w-full border-0 ${viewerLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                    allowFullScreen
                    onLoad={() => setViewerLoading(false)}
                  />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-gray-900 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gray-700 bg-gray-800/70">
                    <FileText className="h-8 w-8 text-gray-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-200">No study available</p>
                  <p className="text-xs text-gray-400">
                    This report is missing a Study Instance UID and cannot load the embedded viewer.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white border-2 border-blue-100 rounded-xl p-4 h-full shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-medium text-gray-700">Report Content</h2>
            <div className="flex items-center gap-3">
              {report?.versions?.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  Version
                  <select
                    value={selectedVersionNo || (latestVersion ? String(latestVersion.version_no) : '')}
                    onChange={(e) => setSelectedVersionNo(e.target.value)}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {report.versions.map((version) => (
                      <option key={version.version_no} value={String(version.version_no)}>
                        v{version.version_no}{version.version_no === latestVersion?.version_no ? ' (latest)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {viewingVersion && (
                <span className="text-xs text-gray-500 inline-flex items-center">
                  <Shield className="h-3 w-3 mr-1" />
                  v{viewingVersion.version_no}
                </span>
              )}
            </div>
          </div>
        
        {viewingVersion ? (
          <div className="space-y-4">
            {viewingVersion.clinical_context && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Clinical Context</h3>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 leading-relaxed">
                  {viewingVersion.clinical_context}
                </div>
              </div>
            )}
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Findings</h3>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {viewingVersion.findings}
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Impression</h3>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {viewingVersion.impression}
              </div>
            </div>
            
            <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                v{viewingVersion.version_no} • {format(new Date(viewingVersion.created_at), 'MMM dd, yyyy HH:mm')}
              </span>
              {viewingVersion.generated_by_ai && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-purple-100 text-purple-800 text-xs font-medium">
                  <Sparkles className="h-3 w-3 mr-1" /> AI
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="h-12 w-12 bg-gray-100 rounded-lg mx-auto flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No Content</h3>
            <p className="text-xs text-gray-500 mb-4">This report is empty.</p>
            {canEdit && (
              <button
                onClick={() => {
                  if (user?.role === 'observer') {
                    if (report?.preview_upload_id) {
                      navigate(`/demo?uploadId=${report.preview_upload_id}`);
                    } else {
                      toast.error('Source upload not available');
                    }
                    return;
                  }
                  if (!report?.study_instance_uid) {
                    toast.error('Study UID missing for this report');
                    return;
                  }
                  const viewerParams = new URLSearchParams();
                  viewerParams.set('StudyInstanceUID', report.study_instance_uid);
                  if (report.patient_name) viewerParams.set('PatientName', report.patient_name);
                  if (report.patient_id) viewerParams.set('PatientID', report.patient_id);
                  navigate(`/bluelight?${viewerParams.toString()}`);
                }}
                className="inline-flex items-center px-4 py-2 border border-blue-200 text-sm font-medium rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <Edit className="h-4 w-4 mr-1.5" />
                Open in BlueLight
              </button>
            )}
          </div>
        )}
      </div>

      {canFinalize && !report.finalized_at && latestVersion && (
        <div className="pb-8">
          <button
            onClick={() => setShowConfirmDialog(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <CheckCircle className="h-4 w-4" />
            Finalize Report
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">
                Delete report
              </h3>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm text-gray-600">
              <p>
                Permanently remove this draft from ChickadeeX? Linked study uploads will be detached.
              </p>
              <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 text-xs text-rose-600">
                This action cannot be undone.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => {
                  if (!deleting) {
                    setDeleteDialogOpen(false);
                  }
                }}
                disabled={deleting}
                className="px-3 py-1.5 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center px-4 py-1.5 border border-rose-200 text-sm font-medium rounded-lg text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-colors disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span className="ml-2">Deleting…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center mb-4">
              <div className="h-10 w-10 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                <Shield className="h-5 w-5 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Finalize Report
              </h3>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-3">
                Are you sure you want to finalize this report? This action cannot be undone.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> Once finalized, this report will become unchangeable and cannot be edited in the demo viewer.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={finalizing}
                className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="inline-flex items-center px-4 py-2 border border-green-200 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors disabled:opacity-50"
              >
                {finalizing ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span className="ml-2">Finalizing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Finalize Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
};

export default ReportDetailPage;
