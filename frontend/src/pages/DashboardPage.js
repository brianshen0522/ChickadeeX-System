import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageContext } from '../contexts/PageContext';
import {
  FileText,
  FolderOpen,
  Activity,
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
  UploadCloud
} from 'lucide-react';
import { getStatistics, getUserStats } from '../services/adminService';
import { getReportsStats } from '../services/reportService';
import { getStudiesStats } from '../services/dicomService';

const DashboardPage = () => {
  const { user } = useAuth();
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [doctorMetrics, setDoctorMetrics] = useState(null);

  useEffect(() => {
    setPageTitle('Home');
    setPageDescription('');
    setBreadcrumbs([
      { label: 'Home', href: '/', isCurrent: true }
    ]);
  }, [setPageDescription, setPageTitle, setBreadcrumbs]);

  const role = user?.role;
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
          const [reportStats, studiesStats] = await Promise.all([
            getReportsStats(),
            getStudiesStats()
          ]);
          if (isMounted) {
            setDoctorMetrics({ reportStats, studiesStats });
            setAdminMetrics(null);
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard metrics', error);
        if (isMounted) {
          setAdminMetrics(null);
          setDoctorMetrics(null);
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
  }, [role]);

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
        value: formatNumber(stats.finalized_reports),
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
      cards.push({
        title: 'Finalized This Week',
        value: formatNumber(doctorMetrics.reportStats.finalized_reports),
        icon: CheckCircle,
        surface: 'border-primary-100 bg-primary-50',
        iconColor: 'text-primary-600'
      });
      cards.push({
        title: 'Draft Queue',
        value: formatNumber(doctorMetrics.reportStats.draft_reports),
        icon: Clock,
        surface: 'border-warning-100 bg-warning-50',
        iconColor: 'text-warning-600'
      });
      cards.push({
        title: 'Studies Viewed',
        value: formatNumber(
          doctorMetrics.studiesStats?.totalStudiesViewed ??
            doctorMetrics.studiesStats?.totalStudies
        ),
        icon: Activity,
        surface: 'border-success-100 bg-success-50',
        iconColor: 'text-success-600'
      });
    }

    return cards;
  }, [adminMetrics, doctorMetrics, role]);

  const skeletonCount = metricCards.length || (shouldShowMetrics ? 3 : 0);

  const sections = useMemo(() => {
    // Original layout for other roles
    const baseSections = [
      {
        title: 'Clinical Operations',
        items: [
          {
            name: 'Reports Workspace',
            description: 'Review drafts, finalize studies, and export signed reports.',
            icon: FileText,
            to: '/reports',
            cta: 'Open Reports',
            roles: ['admin', 'doctor', 'researcher']
          },
          {
            name: 'Studies Explorer',
            description: 'Search PACS studies with modality and date filters.',
            icon: FolderOpen,
            to: '/studies',
            cta: 'Browse Studies',
            roles: ['doctor']
          },
          {
            name: 'BlueLight Viewer',
            description: 'Launch the embedded DICOM viewer for synchronized reporting.',
            icon: Activity,
            to: '/bluelight',
            cta: 'Open Viewer',
            roles: ['doctor']
          }
        ]
      },
      {
        title: 'Intelligence & Assistance',
        items: [
          {
            name: 'AI Drafting',
            description: 'Generate report previews with the configured language model.',
            icon: Sparkles,
            to: '/reports',
            cta: 'Generate Draft',
            roles: ['admin', 'doctor']
          }
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
            description: 'Update personal details, notification settings, and credentials.',
            icon: UserCircle,
            to: '/profile',
            cta: 'View Profile',
            roles: ['admin', 'doctor', 'researcher']
          },
          {
            name: 'Support & Feedback',
            description: 'Raise issues or request enhancements for ChickadeeX.',
            icon: Settings2,
            to: '/profile',
            cta: 'Contact Support',
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
      {shouldShowMetrics && (loadingMetrics || metricCards.length > 0) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {loadingMetrics
            ? Array.from({ length: skeletonCount || 3 }).map((_, index) => (
                <div
                  key={`metric-skeleton-${index}`}
                  className="h-20 animate-pulse rounded-md border border-slate-200 bg-slate-100"
                />
              ))
            : metricCards.map((card) => (
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

      {role === 'observer' ? (
        <div className="mx-auto w-full max-w-4xl">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-medical">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[1.1fr_0.9fr]">
              <div className="p-10 md:p-12 bg-gradient-to-br from-blue-50 via-white to-white">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">
                  Observer Mode
                </div>
                <h2 className="mt-6 text-3xl font-bold text-slate-900">
                  Experience the ChickadeeX Demo Workspace
                </h2>
                <p className="mt-4 max-w-lg text-base text-slate-600">
                  Jump into our guided demo to explore the BlueLight viewer, AI-assisted reporting, and streamlined study management without configuration. Perfect for first impressions and live walk-throughs.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/demo"
                    className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-6 py-3 text-base font-semibold text-white shadow-[0_18px_35px_-12px_rgba(37,99,235,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_-12px_rgba(37,99,235,0.55)] focus:outline-none focus:ring-4 focus:ring-blue-500/30"
                  >
                    <UploadCloud className="h-5 w-5" />
                    Try the Demo
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    to="/reports"
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <FileText className="h-5 w-5" />
                    Browse Reports
                  </Link>
                </div>
              </div>
              <div className="relative overflow-hidden p-10 md:p-0">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-slate-900 to-black opacity-70" />
                <div className="relative h-full w-full">
                  <div className="flex h-full flex-col justify-between p-10 text-white">
                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]">
                        Walkthrough
                      </span>
                      <h3 className="mt-5 text-2xl font-bold">
                        What you can explore
                      </h3>
                      <ul className="mt-6 space-y-4 text-sm text-white/80">
                        <li className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-blue-200" />
                          <div>
                            <p className="font-semibold text-white">BlueLight viewer</p>
                            <p>Navigate imaging studies with synchronized report previews.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-blue-200" />
                          <div>
                            <p className="font-semibold text-white">AI assistance</p>
                            <p>Generate draft findings and impressions in a click.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-blue-200" />
                          <div>
                            <p className="font-semibold text-white">Versioning & audit</p>
                            <p>See how ChickadeeX tracks edits with version history.</p>
                          </div>
                        </li>
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                      <p className="text-sm text-white/80">Prefer a step-by-step walkthrough?</p>
                      <Link
                        to="/guide"
                        className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:border-white/60 hover:bg-white/20"
                      >
                        Open Guide
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
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
                    className="group rounded-lg border border-slate-200 bg-white p-4 transition hover:border-primary-300 hover:shadow-medical"
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
