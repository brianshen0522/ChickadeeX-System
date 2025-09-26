import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getReports } from '../services/reportService';
import { Search, Filter, Eye, Download, CheckCircle, Clock, User, Calendar, FileText, X, BarChart3, Activity, Shield } from 'lucide-react';
import { format } from 'date-fns';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { usePageContext } from '../contexts/PageContext';

const ReportsPage = () => {
  const { user } = useAuth();
  const { setPageTitle, setPageDescription } = usePageContext();
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
    finalized_only: false
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0
  });

  // Initialize page title
  useEffect(() => {
    setPageTitle('Medical Reports');
  }, [setPageTitle]);

  useEffect(() => {
    // Derive defaults from role when user becomes available
    if (!user) return;
    const isRO = user.role === 'researcher' || user.role === 'observer';
    // Put the role-specific context on the top nav bar (right side)
    const desc = user.role === 'doctor'
      ? 'Create, edit, and manage medical imaging reports.'
      : user.role === 'researcher'
        ? 'Access finalized reports for research purposes.'
        : user.role === 'observer'
          ? 'View finalized medical imaging reports.'
          : 'View and manage all medical reports.';
    setPageDescription(desc);
    setFilters((prev) => ({
      ...prev,
      status: isRO ? 'finalized' : 'all',
      finalized_only: isRO
    }));
  }, [user]);

  // Fetch whenever filters or pagination change
  useEffect(() => {
    fetchReports();
  }, [filters, pagination.offset]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        limit: pagination.limit,
        offset: pagination.offset
      };
      
      // Convert status filter to backend flags
      if (params.status === 'finalized') {
        params.finalized_only = true;
        delete params.draft_only;
      } else if (params.status === 'draft') {
        params.draft_only = true;
        delete params.finalized_only;
      } else {
        // For 'all', avoid sending either flag
        delete params.finalized_only;
        delete params.draft_only;
      }
      // Remove status from params as backend doesn't use it
      delete params.status;
      
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === 'all') {
          delete params[key];
        }
      });

      const data = await getReports(params);
      setReports(data.reports || []);
      setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
    } catch (error) {
      console.error('Fetch reports error:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
  };

  const handlePageChange = (newOffset) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
  };

  const canCreateReports = false; // Create Report disabled per project scope
  const canExport = ['doctor', 'researcher'].includes(user?.role);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Minimal Header */}
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
        
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-gray-600">{pagination.total} total</span>
          <span className="text-green-600">{reports.filter(r => r.is_finalized).length} completed</span>
          <span className="text-yellow-600">{reports.filter(r => !r.is_finalized).length} pending</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex-shrink-0">
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
          
          {['admin', 'doctor'].includes(user?.role) && (
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="finalized">Final</option>
            </select>
          )}
          
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
                  setFilters({
                    patient_id: '',
                    patient_name: '',
                    study_instance_uid: '',
                    report_date_from: '',
                    report_date_to: '',
                    modality: '',
                    status: user?.role === 'researcher' || user?.role === 'observer' ? 'finalized' : 'all',
                    finalized_only: user?.role === 'researcher' || user?.role === 'observer'
                  });
                  setPagination(prev => ({ ...prev, offset: 0 }));
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

      {(filters.patient_name || filters.patient_id || filters.modality || filters.report_date_from || filters.report_date_to || filters.study_instance_uid || (filters.status !== 'all' && ['admin', 'doctor'].includes(user?.role))) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="h-3 w-3 text-blue-600" />
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {(filters.patient_name || filters.patient_id) && (
                  <span className="bg-blue-100 px-2 py-1 rounded text-blue-700">
                    {filters.patient_name || filters.patient_id}
                  </span>
                )}
                {filters.modality && (
                  <span className="bg-blue-100 px-2 py-1 rounded text-blue-700">
                    {filters.modality}
                  </span>
                )}
                {filters.status !== 'all' && ['admin', 'doctor'].includes(user?.role) && (
                  <span className="bg-blue-100 px-2 py-1 rounded text-blue-700">
                    {filters.status === 'finalized' ? 'Final' : 'Draft'}
                  </span>
                )}
                {(filters.report_date_from || filters.report_date_to) && (
                  <span className="bg-blue-100 px-2 py-1 rounded text-blue-700">
                    Date filtered
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setFilters({
                  patient_id: '',
                  patient_name: '',
                  study_instance_uid: '',
                  report_date_from: '',
                  report_date_to: '',
                  modality: '',
                  status: user?.role === 'researcher' || user?.role === 'observer' ? 'finalized' : 'all',
                  finalized_only: user?.role === 'researcher' || user?.role === 'observer'
                });
                setPagination(prev => ({ ...prev, offset: 0 }));
              }}
              className="text-xs text-blue-700 hover:text-blue-800 px-1 py-0.5 rounded hover:bg-blue-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-200 transition-colors bg-white">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        {/* Status Icon */}
                        <div className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                          report.is_finalized 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-yellow-100 text-yellow-600'
                        }`}>
                          {report.is_finalized ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        
                        {/* Report Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-base font-semibold text-gray-900 truncate">
                              {report.patient_name || `Patient ${report.patient_id}`}
                            </h3>
                            <span className={`text-xs font-medium ${
                              report.is_finalized ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                              {report.is_finalized ? 'Completed' : 'In Progress'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                            <div>
                              <span className="text-gray-500 text-xs">Modality</span>
                              <div className="font-medium text-gray-900">{report.modality}</div>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs">Patient ID</span>
                              <div className="font-mono text-gray-900 text-xs">
                                {report.patient_id.length > 12 ? `${report.patient_id.substring(0, 12)}...` : report.patient_id}
                              </div>
                            </div>
                            {report.study_date && (
                              <div>
                                <span className="text-gray-500 text-xs">Study Date</span>
                                <div className="font-medium text-gray-900">{format(new Date(report.study_date), 'MMM dd')}</div>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-500 text-xs">Created</span>
                              <div className="font-medium text-gray-900">{format(new Date(report.created_at), 'MMM dd')}</div>
                            </div>
                          </div>
                          
                          {report.study_description && (
                            <div className="mt-2">
                              <span className="text-xs text-gray-500">Description: </span>
                              <span className="text-sm text-gray-700">{report.study_description.length > 60 ? `${report.study_description.substring(0, 60)}...` : report.study_description}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center space-x-2 ml-4">
                        <Link
                          to={`/reports/${report.id}`}
                          className="inline-flex items-center px-3 py-1.5 border border-blue-200 text-sm font-medium rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          View
                        </Link>
                        
                        {canExport && report.is_finalized && (
                          <button
                            onClick={() => toast.success('Export feature will be implemented')}
                            className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
  );
};

export default ReportsPage;
