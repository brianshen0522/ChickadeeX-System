import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getReports, deleteReport, getReportsSummary } from '../services/reportService';
import { Search, Filter, Eye, Download, CheckCircle, Clock, User, FileText, X, BarChart3, Activity, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { usePageContext } from '../contexts/PageContext';

const ReportsPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    patient_id: '',
    patient_name: '',
    study_instance_uid: '',
    report_date_from: '',
    report_date_to: '',
    modality: '',
    status: 'all',
    finalized_only: false,
    draft_only: false
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0
  });
  const [deletingId, setDeletingId] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalTarget, setDeleteModalTarget] = useState(null);

  useEffect(() => {
    if (!user) return;
    const isRO = user.role === 'researcher' || user.role === 'observer';
    const desc = user.role === 'doctor'
      ? 'Create, edit, and manage medical imaging reports.'
      : user.role === 'researcher'
        ? 'Access finalized reports for research purposes.'
        : user.role === 'observer'
          ? 'View finalized medical imaging reports.'
          : 'View and manage all medical reports.';
    setPageDescription(desc);

    const isLanding = location.pathname === '/reports';
    const isDraftView = location.pathname === '/reports/draft';
    const isDetailView = /^\/reports\/[0-9a-fA-F-]+$/.test(location.pathname);

    if (isRO && !isDetailView && isLanding) {
      navigate('/reports/finalized', { replace: true });
    }
  }, [location.pathname, navigate, setPageDescription, user]);

  useEffect(() => {
    const pathStatus = (() => {
      if (location.pathname.startsWith('/reports/draft')) return 'draft';
      if (location.pathname.startsWith('/reports/finalized')) return 'finalized';
      return 'all';
    })();

    if (filters.status !== pathStatus || filters.finalized_only || filters.draft_only) {
      setFilters((prev) => ({
        ...prev,
        status: pathStatus,
        finalized_only: false,
        draft_only: false
      }));
      if (filters.status !== pathStatus) {
        setPagination((prev) => ({ ...prev, offset: 0 }));
      }
    }
  }, [filters.draft_only, filters.finalized_only, filters.status, location.pathname]);

  useEffect(() => {
    const title = (() => {
      switch (filters.status) {
        case 'draft':
          return 'Draft Reports';
        case 'finalized':
          return 'Finalized Reports';
        default:
          return 'All Reports';
      }
    })();

    setPageTitle(title);
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Reports', href: '/reports' },
      { label: title, href: undefined, isCurrent: true }
    ]);
  }, [filters.status, setBreadcrumbs, setPageTitle]);

  // Fetch whenever filters or pagination change
  useEffect(() => {
    fetchReports();
  }, [filters, pagination.offset]);

  const formatDisplayDate = (value, pattern = 'MMM dd') => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    try {
      return format(date, pattern);
    } catch (error) {
      console.warn('Failed to format date value', value, error);
      return '—';
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        limit: pagination.limit,
        offset: pagination.offset
      };
      delete params.finalized_only;
      delete params.draft_only;
      
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === 'all') {
          delete params[key];
        }
      });

      if (params.status && params.status !== 'all') {
        params.status = params.status.toLowerCase();
      } else {
        delete params.status;
      }

      const data = await getReports(params);
      const payload = data.reports || [];
      const filteredReports = (() => {
        if (filters.status === 'draft') {
          return payload.filter((report) => {
            const statusValue = report.status || (report.is_finalized ? 'finalized' : 'draft');
            return statusValue === 'draft';
          });
        }
        if (filters.status === 'finalized') {
          return payload.filter((report) => {
            const statusValue = report.status || (report.is_finalized ? 'finalized' : 'draft');
            return statusValue === 'finalized' || statusValue === 'completed';
          });
        }
        return payload;
      })();

      setReports(filteredReports);
      setPagination(prev => ({
        ...prev,
        total: data.pagination?.total ?? filteredReports.length
      }));
    } catch (error) {
      console.error('Fetch reports error:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const canDelete = ['doctor', 'observer', 'admin'].includes(user?.role);

  const openDeleteModal = (report) => {
    if (!canDelete) return;
    setDeleteModalTarget(report);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setDeleteModalOpen(false);
    setDeleteModalTarget(null);
  };

  const confirmDeleteReport = async () => {
    if (!canDelete || !deleteModalTarget) return;
    const report = deleteModalTarget;
    setDeletingId(report.id);
    try {
      const shouldStepBack = reports.length === 1 && pagination.offset >= pagination.limit;
      await deleteReport(report.id);
      toast.success('Report deleted');
      if (shouldStepBack) {
        setPagination((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
      } else {
        fetchReports();
      }
      setDeleteModalOpen(false);
      setDeleteModalTarget(null);
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to delete report';
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'status' ? { finalized_only: false, draft_only: false } : {})
    }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page

    if (field === 'status') {
      if (value === 'draft') {
        navigate('/reports/draft', { replace: true });
      } else if (value === 'finalized') {
        navigate('/reports/finalized', { replace: true });
      } else {
        navigate('/reports', { replace: true });
      }
    }
  };

  const handlePageChange = (newOffset) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
  };

  const canCreateReports = false; // Create Report disabled per project scope
  const canExport = ['doctor', 'researcher'].includes(user?.role);
  const statusLabelMap = {
    all: 'All Reports',
    draft: 'Draft Reports',
    finalized: 'Finalized Reports'
  };
  const activeStatusLabel = statusLabelMap[filters.status] || 'All Reports';

  return (
    <>
      <div className="flex flex-col h-full space-y-4">
      {/* Compact Header Summary */}
      <div className="flex flex-col gap-2 text-[0.75rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.2em] text-[0.65rem] font-semibold text-rose-500">Report Summary</span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-600">
            {activeStatusLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="inline-flex items-center gap-1 text-slate-600">
            <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
            {pagination.total} total
          </span>
          <span className="inline-flex items-center gap-1 text-success-600">
            <CheckCircle className="h-3.5 w-3.5" />
            {reports.filter(r => r.is_finalized).length} finalized
          </span>
          <span className="inline-flex items-center gap-1 text-warning-600">
            <Clock className="h-3.5 w-3.5" />
            {reports.filter(r => !r.is_finalized).length} drafts
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Search patient..."
              value={filters.patient_name || filters.patient_id}
              onChange={(e) => {
                const value = e.target.value;
                setFilters(prev => ({ ...prev, patient_name: '', patient_id: '' }));
                if (/^[A-Z0-9\-_]+$/i.test(value) && value.length < 20) {
                  handleFilterChange('patient_id', value);
                } else {
                  handleFilterChange('patient_name', value);
                }
              }}
            />
          </div>
          
          <button
            onClick={fetchReports}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-lg transition-colors ${
              showAdvancedFilters 
                ? 'border-blue-200 text-blue-700 bg-blue-50' 
                : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Study UID</label>
                <input
                  type="text"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter UID..."
                  value={filters.study_instance_uid}
                  onChange={(e) => handleFilterChange('study_instance_uid', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Modality</label>
                <select
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={filters.modality}
                  onChange={(e) => handleFilterChange('modality', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="CT">CT</option>
                  <option value="MR">MR</option>
                  <option value="US">US</option>
                  <option value="CR">X-Ray</option>
                  <option value="MG">Mammography</option>
                  <option value="OT">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={filters.report_date_from}
                  onChange={(e) => handleFilterChange('report_date_from', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={filters.report_date_to}
                  onChange={(e) => handleFilterChange('report_date_to', e.target.value)}
                />
              </div>
            </div>
            
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  const defaultStatus = user?.role === 'researcher' || user?.role === 'observer' ? 'finalized' : 'all';
                  setFilters({
                    patient_id: '',
                    patient_name: '',
                    study_instance_uid: '',
                    report_date_from: '',
                    report_date_to: '',
                    modality: '',
                    status: defaultStatus,
                    finalized_only: false,
                    draft_only: false
                  });
                  setPagination(prev => ({ ...prev, offset: 0 }));
                  const params = new URLSearchParams(location.search);
                  if (defaultStatus === 'all') {
                    params.delete('status');
                  } else {
                    params.set('status', defaultStatus);
                  }
                  navigate({
                    pathname: location.pathname,
                    search: params.toString() ? `?${params.toString()}` : ''
                  }, { replace: true });
                }}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-colors"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reports List */}
      <div className="bg-white border border-gray-200 rounded-lg flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 bg-gray-100 rounded-xl mx-auto flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Reports Found</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              Try adjusting your search criteria to find the reports you're looking for.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="space-y-3 sm:space-y-2.5">
                {reports.map((report) => {
                  const statusValue = report.status || (report.is_finalized ? 'finalized' : 'draft');
                  const isFinalized = statusValue === 'finalized' || statusValue === 'completed' || report.is_finalized;
                  const reportTitle = report.title || report.patient_name || (report.patient_id ? `Patient ${report.patient_id}` : 'Report');
                  const patientIdentifier = report.patient_id || '—';
                  const truncatedPatientId = patientIdentifier.length > 12 ? `${patientIdentifier.substring(0, 12)}...` : patientIdentifier;
                  const rawDescriptor = report.description ?? report.study_description ?? '';
                  let normalizedDescription = rawDescriptor;
                  if (rawDescriptor && rawDescriptor.includes('\n\n')) {
                    const [titlePart, ...rest] = rawDescriptor.split(/\n\n/);
                    normalizedDescription = rest.join('\n\n') || titlePart;
                  }

                  return (
                    <div
                      key={report.id}
                      className="border border-gray-200 rounded-md px-3.5 py-2.5 hover:border-blue-200 transition-colors bg-white shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={`flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center ${
                              isFinalized ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                            }`}
                            aria-hidden="true"
                          >
                            {isFinalized ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900 truncate">
                                {reportTitle}
                              </h3>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide ${
                                  isFinalized ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                                }`}
                              >
                                {isFinalized ? 'Completed' : 'In Progress'}
                              </span>
                            </div>

                            <div className="mt-1">
                              <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2 sm:items-center">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gray-500">Modality</span>
                                  <span className="text-gray-800">{report.modality || '—'}</span>
                                  <span className="text-gray-300">•</span>
                                  <span className="font-medium text-gray-500">Patient</span>
                                  <span className="font-mono text-gray-800">{truncatedPatientId}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end text-gray-500">
                                  <span className="font-medium">Created</span>
                                  <span className="text-gray-800">
                                    {formatDisplayDate(report.created_at)}
                                  </span>
                                  {report.updated_at && (
                                    <>
                                      <span className="text-gray-300">•</span>
                                      <span className="font-medium">Updated</span>
                                      <span className="text-gray-800">
                                        {formatDisplayDate(report.updated_at)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {rawDescriptor && (
                              <div className="mt-1 text-xs text-gray-600 flex flex-wrap items-center gap-1">
                                {reportTitle && (
                                  <span className="font-medium text-gray-700 truncate max-w-[10rem] sm:max-w-[14rem]">
                                    {reportTitle}
                                  </span>
                                )}
                                {reportTitle && normalizedDescription && (
                                  <span className="text-gray-300">|</span>
                                )}
                                {normalizedDescription && (
                                  <span
                                    className="truncate text-gray-500 max-w-[12rem] sm:max-w-[18rem]"
                                    title={normalizedDescription}
                                  >
                                    {normalizedDescription}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-shrink-0 items-center justify-end gap-2 sm:gap-3">
                          <Link
                            to={`/reports/${report.id}`}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors leading-none"
                            aria-label="View report"
                            title="View report"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View</span>
                          </Link>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => openDeleteModal(report)}
                              disabled={deletingId === report.id}
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              aria-label="Delete report"
                              title="Delete report"
                            >
                              {deletingId === report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="sr-only">Delete</span>
                            </button>
                          )}

                          {canExport && isFinalized && (
                            <button
                              onClick={() => toast.success('Export feature will be implemented')}
                              className="hidden h-9 shrink-0 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 sm:flex"
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              Export
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Pagination */}
      {reports.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.offset + pagination.limit)}
              disabled={pagination.offset + pagination.limit >= pagination.total}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
          
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-gray-400" />
              <p className="text-sm text-gray-600">
                Showing{' '}
                <span className="font-semibold text-gray-900">{pagination.offset + 1}</span>
                {' '}to{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(pagination.offset + pagination.limit, pagination.total)}
                </span>
                {' '}of{' '}
                <span className="font-semibold text-gray-900">{pagination.total}</span>
                {' '}reports
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px">
                <button
                  onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
                  disabled={pagination.offset === 0}
                  className="relative inline-flex items-center px-4 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.offset + pagination.limit)}
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                  className="relative inline-flex items-center px-4 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
      </div>

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Delete report</h2>
            </div>
            <div className="px-5 py-4 text-sm text-slate-600 space-y-3">
              <p>
                {deleteModalTarget
                  ? `Remove “${deleteModalTarget.patient_name || deleteModalTarget.patient_id || 'this report'}” from your workspace?`
                  : 'Remove this report from your workspace?'}
              </p>
              <p className="text-xs text-slate-500">
                This action permanently removes the report and all saved versions.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteReport}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-60"
              >
                {deletingId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting…
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
    </>
  );
};

export default ReportsPage;
