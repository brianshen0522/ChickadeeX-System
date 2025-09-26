import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getReports, getReportsStats } from '../services/reportService';
import { getStatistics, getUserStats } from '../services/adminService';
import { getStudiesStats } from '../services/dicomService';
import { FileText, Clock, CheckCircle, Users, BarChart3, FolderOpen, TrendingUp, Activity, Shield, Calendar } from 'lucide-react';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { usePageContext } from '../contexts/PageContext';

const DashboardPage = () => {
  const { user } = useAuth();
  const { setPageTitle, setPageDescription } = usePageContext();
  const [recentReports, setRecentReports] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [doctorStats, setDoctorStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageTitle('Dashboard');
    setPageDescription(''); // Clear description for dashboard
    fetchDashboardData();
  }, [setPageTitle, setPageDescription]);

  // Add a refresh function for external use
  const refreshDashboard = () => {
    fetchDashboardData();
  };

  // Listen for dashboard refresh events
  useEffect(() => {
    const handleDashboardRefresh = () => {
      fetchDashboardData();
    };

    window.addEventListener('dashboardRefresh', handleDashboardRefresh);
    
    return () => {
      window.removeEventListener('dashboardRefresh', handleDashboardRefresh);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const promises = [
        getReports({ limit: 5, offset: 0 })
      ];

      // Add admin-specific data
      if (user?.role === 'admin') {
        promises.push(getStatistics());
        promises.push(getUserStats());
      }

      // Add doctor-specific data
      if (user?.role === 'doctor') {
        promises.push(getReportsStats());
        promises.push(getStudiesStats());
      }

      const results = await Promise.all(promises);
      
      setRecentReports(results[0].reports || []);
      
      if (user?.role === 'admin') {
        setStatistics(results[1]);
        setUserStats(results[2]);
      }

      if (user?.role === 'doctor') {
        const reportStats = results[1];
        const studiesStats = results[2];
        setDoctorStats({
          ...reportStats,
          ...studiesStats
        });
      }
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const isDoctorOrAdmin = ['doctor', 'admin'].includes(user?.role);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Minimal Header with Role Indicator */}
      <div className="flex items-center justify-between min-h-[2.5rem]">
        <div className="flex items-center space-x-3 flex-shrink-0">
          <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium leading-none ${
            user?.role === 'admin' ? 'bg-error-100 text-error-800 border border-error-200' : 
            user?.role === 'doctor' ? 'bg-accent-teal bg-opacity-10 text-accent-teal border border-accent-teal border-opacity-20' :
            user?.role === 'researcher' ? 'bg-success-100 text-success-800 border border-success-200' :
            'bg-primary-100 text-primary-800 border border-primary-200'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
              user?.role === 'admin' ? 'bg-error-500' : 
              user?.role === 'doctor' ? 'bg-accent-teal' :
              user?.role === 'researcher' ? 'bg-success-500' :
              'bg-primary-500'
            }`}></div>
            <span className="whitespace-nowrap">
              {user?.role?.charAt(0)?.toUpperCase() + user?.role?.slice(1)}
            </span>
          </div>
          <span className="text-neutral-600 font-medium leading-none whitespace-nowrap">{user?.name}</span>
        </div>
        
        <div className="flex items-center space-x-2 flex-shrink-0">
          {isDoctorOrAdmin && (
            <>
              <Link
                to="/reports"
                className="inline-flex items-center justify-center px-3 py-2 border border-neutral-300 rounded-medical text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all duration-200 shadow-soft min-h-[2rem]"
              >
                <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="whitespace-nowrap">Reports</span>
              </Link>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="inline-flex items-center justify-center px-3 py-2 border border-neutral-300 rounded-medical text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all duration-200 shadow-soft min-h-[2rem]"
                >
                  <BarChart3 className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">Admin</span>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Medical Statistics Cards (Admin) */}
      {(user?.role === 'admin' && statistics && userStats) && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Reports */}
            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-primary-100 rounded-medical flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Total Reports
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {statistics.total_reports}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Draft Reports */}
            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-warning-100 rounded-medical flex items-center justify-center">
                      <Clock className="h-5 w-5 text-warning-600" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Draft Reports
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {Math.max(0, statistics.total_reports - statistics.finalized_reports)}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Finalized Reports */}
            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-success-100 rounded-medical flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-success-600" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Finalized Reports
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {statistics.finalized_reports}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Users (with active/inactive breakdown) */}
            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-medical-teal bg-opacity-20 rounded-medical flex items-center justify-center">
                      <Users className="h-5 w-5 text-medical-teal" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        System Users
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {userStats.totalUsers}
                      </dd>
                      <dd className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs text-primary-700">
                          <span>Active</span>
                          <span className="font-medium text-success-600">{userStats.activeUsers}</span>
                        </div>
                        <div className="flex justify-between text-xs text-primary-700">
                          <span>Inactive</span>
                          <span className="font-medium text-primary-500">{userStats.inactiveUsers}</span>
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Medical Doctor Statistics */}
      {user?.role === 'doctor' && doctorStats && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-900">Clinical Performance Metrics</h2>
            <div className="flex items-center space-x-2 text-sm text-primary-600">
              <Shield className="h-4 w-4" />
              <span>Personal dashboard</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-primary-100 rounded-medical flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Total Reports
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {doctorStats.totalReports}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-warning-100 rounded-medical flex items-center justify-center">
                      <Clock className="h-5 w-5 text-warning-600" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Draft Reports
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {doctorStats.draftReports}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-success-100 rounded-medical flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-success-600" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Finalized Reports
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {doctorStats.finalizedReports}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-medical hover:shadow-medical-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-medical-teal bg-opacity-20 rounded-medical flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-medical-teal" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-primary-600 truncate">
                        Available Studies
                      </dt>
                      <dd className="text-2xl font-bold text-primary-900">
                        {doctorStats.totalStudies}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Medical Reports Section */}
      <div className="card-medical shadow-medical">
        <div className="px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-primary-100 rounded-medical flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-lg font-semibold text-primary-900">Recent Medical Activity</h2>
            </div>
            <Link
              to="/reports"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-800 transition-colors"
            >
              View all reports
              <BarChart3 className="ml-1 h-4 w-4" />
            </Link>
          </div>

          {recentReports.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 bg-primary-100 rounded-medical mx-auto flex items-center justify-center mb-4 shadow-chickadee">
                <FileText className="h-8 w-8 text-primary-400" />
              </div>
              <h3 className="text-base font-medium text-primary-900 mb-2">No Recent Medical Activity</h3>
              <p className="text-sm text-primary-600 max-w-sm mx-auto">
                {user?.role === 'doctor' 
                  ? 'Your recent medical reports and diagnostic activities will appear here once you start working with the ChickadeeX system.'
                  : 'Recent medical system activity and diagnostic reports will be displayed in this section.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <div key={report.id} className="border border-primary-200 rounded-medical p-4 hover:bg-chickadee-ivory hover:bg-opacity-50 transition-all duration-200 shadow-chickadee">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className={`h-10 w-10 rounded-medical flex items-center justify-center ${
                        report.is_finalized ? 'bg-success-100' : 'bg-warning-100'
                      }`}>
                        {report.is_finalized ? (
                          <CheckCircle className="h-5 w-5 text-success-600" />
                        ) : (
                          <Clock className="h-5 w-5 text-warning-600" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/reports/${report.id}`}
                        className="text-sm font-semibold text-primary-900 hover:text-primary-700 transition-colors"
                      >
                        {report.patient_name || report.patient_id} - {report.modality}
                      </Link>
                      <p className="text-sm text-primary-600 mt-1">
                        {report.study_description}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`badge ${
                        report.is_finalized 
                          ? 'status-finalized' 
                          : 'status-draft'
                      }`}>
                        {report.is_finalized ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
