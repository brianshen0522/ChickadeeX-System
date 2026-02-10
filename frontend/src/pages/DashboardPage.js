import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageContext } from '../contexts/PageContext';
import {
  FileText,
  FolderOpen,
  Users,
  Cpu,
  Database,
  Shield,
  Settings2,
  UserCircle,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Clock,
  UploadCloud,
  Edit3
} from 'lucide-react';
import { getStatistics, getUserStats } from '../services/adminService';
import { getReportsStats } from '../services/reportService';
import { useHealthStatus } from '../hooks/useHealthStatus';

const DashboardPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const doctorId = user?.id;
  const { pacsHealth } = useHealthStatus(role === 'doctor');
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [doctorMetrics, setDoctorMetrics] = useState(null);

  useEffect(() => {
    setPageTitle('Home');
    setPageDescription('');
    setBreadcrumbs([
      { label: 'Home', href: '/', isCurrent: true }
    ]);
  }, [setPageDescription, setPageTitle, setBreadcrumbs]);

  const shouldShowMetrics = role === 'admin' || role === 'doctor';

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      if (!role || !['admin', 'doctor'].includes(role)) {
        setAdminMetrics(null);
        setDoctorMetrics(null);
        setLoadingMetrics(false);
        return;
      }

      setLoadingMetrics(true);
      setMetricsError(null);
      try {
        if (role === 'admin') {
          const [statsData, userData] = await Promise.all([
            getStatistics(),
            getUserStats()
          ]);
          if (isMounted) {
            setAdminMetrics({ stats: statsData, users: userData });
            setDoctorMetrics(null);
          }
        } else if (role === 'doctor') {
          if (!doctorId) {
            if (isMounted) {
              setDoctorMetrics(null);
              setLoadingMetrics(false);
            }
            return;
          }
          const reportStats = await getReportsStats({ doctor_id: doctorId });
          if (isMounted) {
            setDoctorMetrics({ reportStats });
            setAdminMetrics(null);
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard metrics', error);
        if (isMounted) {
          setAdminMetrics(null);
          setDoctorMetrics(null);
          setMetricsError(error);
        }
      } finally {
        if (isMounted) {
          setLoadingMetrics(false);
        }
      }
    };

    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, [role, doctorId]);

  const formatNumber = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value.toLocaleString();
    return value;
  };

  const metricCards = useMemo(() => {
    const cards = [];
    if (role === 'admin' && adminMetrics?.stats) {
      const stats = adminMetrics.stats;
      const users = adminMetrics.users;
      cards.push({
        title: 'Total Reports',
        value: formatNumber(stats.total_reports),
        icon: FileText,
        surface: 'border-primary-100 bg-primary-50',
        iconColor: 'text-primary-600'
      });
      cards.push({
        title: 'Draft Reports',
        value: formatNumber(stats.draft_reports),
        icon: Clock,
        surface: 'border-warning-100 bg-warning-50',
        iconColor: 'text-warning-600'
      });
      cards.push({
        title: 'Finalized Reports',
        value: formatNumber(stats.finalizedReports),
        icon: CheckCircle,
        surface: 'border-success-100 bg-success-50',
        iconColor: 'text-success-600'
      });
      cards.push({
        title: 'System Users',
        value: formatNumber(users?.totalUsers),
        icon: Users,
        surface: 'border-rose-100 bg-rose-50',
        iconColor: 'text-rose-600',
        breakdown: [
          { label: 'Active', value: formatNumber(users?.activeUsers) },
          { label: 'Inactive', value: formatNumber(users?.inactiveUsers) }
        ]
      });
    }

    if (role === 'doctor' && doctorMetrics?.reportStats) {
      const stats = doctorMetrics.reportStats;
      cards.push({
        title: 'Total Reports',
        value: formatNumber(stats.totalReports),
        icon: FileText,
        surface: 'border-primary-100 bg-primary-50',
        iconColor: 'text-primary-600'
      });
      cards.push({
        title: 'Finalized',
        value: formatNumber(stats.finalizedReports),
        icon: CheckCircle,
        surface: 'border-success-100 bg-success-50',
        iconColor: 'text-success-600'
      });
      cards.push({
        title: 'Drafts',
        value: formatNumber(stats.draftReports),
        icon: Clock,
        surface: 'border-warning-100 bg-warning-50',
        iconColor: 'text-warning-600'
      });
      const pacsStatus =
        pacsHealth.status === 'checking'
          ? 'checking'
          : pacsHealth.healthy
            ? 'online'
            : 'offline';
      const pacsSurface =
        pacsStatus === 'online'
          ? 'border-success-100 bg-success-50'
          : pacsStatus === 'checking'
            ? 'border-slate-200 bg-white'
            : 'border-error-100 bg-error-50';
      const pacsIconColor =
        pacsStatus === 'online'
          ? 'text-success-600'
          : pacsStatus === 'checking'
            ? 'text-slate-400'
            : 'text-error-600';
      cards.push({
        title: 'PACS Health',
        value:
          pacsStatus === 'checking'
            ? 'Checking…'
            : pacsHealth.healthy
              ? 'Online'
              : 'Offline',
        icon: Database,
        surface: pacsSurface,
        iconColor: pacsIconColor,
        breakdown: [
          {
            label: 'Status',
            value: pacsHealth.message || '—'
          },
          ...(pacsHealth.responseTime
            ? [{ label: 'Latency', value: `${pacsHealth.responseTime}ms` }]
            : [])
        ]
      });
    }

    return cards;
  }, [adminMetrics, doctorMetrics, role, pacsHealth]);

  const skeletonCount = metricCards.length || (shouldShowMetrics ? 3 : 0);

  const sections = useMemo(() => {
    const baseSections = [
      {
        title: 'Clinical Operations',
        items: [
          {
            name: 'Reports',
            description: 'Review reports.',
            icon: FileText,
            to: '/reports',
            cta: 'Open Reports',
            roles: ['admin', 'doctor', 'researcher']
          },
          {
            name: 'Studies',
            description: 'Search PACS studies.',
            icon: FolderOpen,
            to: '/studies',
            cta: 'Browse Studies',
            roles: ['doctor']
          },
        ]
      },
      {
        title: 'Administration',
        items: [
          {
            name: 'User Directory',
            description: 'Manage clinical users, invites, and role assignments.',
            icon: Users,
            to: '/admin?tab=users',
            cta: 'Manage Users',
            roles: ['admin']
          },
          {
            name: 'LLM Configuration',
            description: 'Tune prompts, parameters, and model availability.',
            icon: Cpu,
            to: '/admin?tab=llm',
            cta: 'Configure LLMs',
            roles: ['admin']
          },
          {
            name: 'PACS Connectivity',
            description: 'Adjust DICOM proxy endpoints and authentication.',
            icon: Database,
            to: '/admin?tab=pacs',
            cta: 'Edit PACS Settings',
            roles: ['admin']
          },
          {
            name: 'System Policies',
            description: 'Set throttles, system names, and backup policies.',
            icon: Shield,
            to: '/admin?tab=system',
            cta: 'Update Policies',
            roles: ['admin']
          }
        ]
      },
      {
        title: 'Account & Preferences',
        items: [
          {
            name: 'Profile & Preferences',
            description: 'Update personal credentials.',
            icon: UserCircle,
            to: '/profile',
            cta: 'View Profile',
            roles: ['admin', 'doctor', 'researcher']
          }
        ]
      }
    ];

    return baseSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.roles || item.roles.includes(role))
      }))
      .filter((section) => section.items.length > 0);
  }, [role]);

  return (
    <div className="flex h-full flex-col space-y-4">
      {shouldShowMetrics && (
        <div>
          {loadingMetrics ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: skeletonCount || 3 }).map((_, index) => (
                <div
                  key={`metric-skeleton-${index}`}
                  className="h-20 animate-pulse rounded-md border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
          ) : metricsError ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-rose-100 bg-rose-50 px-6 py-6 text-center" role="alert">
              <Shield className="h-8 w-8 text-rose-500" />
              <h3 className="mt-2 text-sm font-semibold text-rose-700">Metrics unavailable</h3>
              <p className="mt-1 text-xs text-rose-600">Please try again in a moment.</p>
            </div>
          ) : metricCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-6 text-center">
              <FileText className="h-8 w-8 text-slate-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-700">No metrics yet</h3>
              <p className="mt-1 text-xs text-slate-500">Metrics will appear once activity is recorded.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map((card) => (
                <div
                  key={card.title}
                  className={`flex items-start gap-3 rounded-md border ${card.surface} px-2.5 py-2.5`}
                >
                  <card.icon className={`mt-0.5 h-6 w-6 flex-shrink-0 ${card.iconColor}`} />
                  <div className="flex-1">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">{card.title}</p>
                    <p className="text-base font-bold text-slate-800">{card.value}</p>
                    {card.breakdown && (
                      <div className="mt-1 space-y-0.5 text-[0.65rem] text-slate-500">
                        {card.breakdown.map((item) => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="font-medium text-slate-500">{item.label}</span>
                            <span className="font-semibold text-slate-700">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {role === 'observer' ? (
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {/* Hero Section with CTA */}
          <div className="border-b border-slate-200 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Try ChickadeeX System</h1>
                <p className="mt-1 text-lg text-slate-600">Experience AI-assisted medical reporting in 4 simple steps</p>
              </div>
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                <UploadCloud className="h-5 w-5" />
                <span>Try Demo</span>
              </Link>
            </div>
          </div>

          {/* Simple Guide Steps */}
          <div className="space-y-4">
            {/* Step 1: Upload */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-6 md:grid-cols-[auto_1fr]">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                        1
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">Upload</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Click Demo, then upload your X-ray image
                    </p>
                  </div>
                </div>
                {/* Video Placeholder */}
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="aspect-video flex items-center justify-center">
                    <video
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      disablePictureInPicture
                      controlsList="nodownload nofullscreen noremoteplayback"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <source src="/assets/guide/main_1_upload.mp4" type="video/mp4" />
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                        Video: main_1_upload.mp4
                      </div>
                    </video>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Generate */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-6 md:grid-cols-[auto_1fr]">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-600">
                        2
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">Generate</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Click Generate for AI-assisted report
                    </p>
                  </div>
                </div>
                {/* Video Placeholder */}
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="aspect-video flex items-center justify-center">
                    <video
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      disablePictureInPicture
                      controlsList="nodownload nofullscreen noremoteplayback"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <source src="/assets/guide/main_2_generate.mp4" type="video/mp4" />
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                        Video: main_2_generate.mp4
                      </div>
                    </video>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Edit & Save */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-6 md:grid-cols-[auto_1fr]">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white">
                    <Edit3 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">
                        3
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">Edit & Save</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Review, edit, then click Save
                    </p>
                  </div>
                </div>
                {/* Video Placeholder */}
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="aspect-video flex items-center justify-center">
                    <video
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      disablePictureInPicture
                      controlsList="nodownload nofullscreen noremoteplayback"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <source src="/assets/guide/main_3_edit_save.mp4" type="video/mp4" />
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                        Video: main_3_edit_save.mp4
                      </div>
                    </video>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Manage */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-6 md:grid-cols-[auto_1fr]">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                        4
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">Manage</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      View drafts in Reports section
                    </p>
                  </div>
                </div>
                {/* Video Placeholder */}
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="aspect-video flex items-center justify-center">
                    <video
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      disablePictureInPicture
                      controlsList="nodownload nofullscreen noremoteplayback"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <source src="/assets/guide/main_4_manage.mp4" type="video/mp4" />
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                        Video: main_4_manage.mp4
                      </div>
                    </video>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Guide Link */}
          <div className="border-t border-slate-200 pt-6 text-center">
            <h3 className="text-xl font-bold text-slate-900">Need More Details?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Check out our detailed guide for step-by-step instructions
            </p>
            <Link
              to="/guide"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Open Detailed Guide
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {section.title}
                </h2>
                <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-300">
                  {section.items.length} tools
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {section.items.map((item) => (
                  <Link
                    key={item.name}
                    to={item.to}
                    className="group rounded-lg border border-slate-200 bg-white p-4 transition hover:border-primary-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-50 text-primary-600">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </div>
                    </div>
                    <span className="mt-3 inline-flex items-center text-sm font-semibold text-primary-600 group-hover:text-primary-700">
                      {item.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
