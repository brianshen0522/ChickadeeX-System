import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Home,
  Loader2,
  Menu,
  Slash,
  ChevronUp,
  LogOut
} from 'lucide-react';
import Sidebar from './Sidebar';
import { usePageContext } from '../../contexts/PageContext';
import { useHealthStatus } from '../../hooks/useHealthStatus';
import { useAuth } from '../../contexts/AuthContext';
import companyLogo from '../../assets/logo_pure.svg';

const Layout = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { pageTitle, breadcrumbs = [] } = usePageContext();
  const { pacsHealth } = useHealthStatus();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const desktopProfileRef = useRef(null);
  const mobileProfileRef = useRef(null);
  const desktopStatusRef = useRef(null);
  const mobileStatusRef = useRef(null);

  const getStatusColors = (health) => {
    if (health.healthy) {
      return {
        bg: 'bg-success-50',
        border: 'border-success-200',
        dot: 'bg-success-500',
        text: 'text-success-800'
      };
    } else {
      return {
        bg: 'bg-error-50',
        border: 'border-error-200', 
        dot: 'bg-error-500',
        text: 'text-error-800'
      };
    }
  };

  const pacsColors = getStatusColors(pacsHealth);
  const routeLabels = useMemo(() => ({
    '/': 'Home',
    '/reports': 'Reports',
    '/reports/new': 'Create Report',
    '/studies': 'Studies',
    '/admin': 'Administration',
    '/admin/users': 'Users',
    '/admin/llm-configs': 'LLM Config',
    '/admin/pacs': 'PACS Settings',
    '/admin/system': 'System Settings',
    '/profile': 'Profile'
  }), []);

  const autoBreadcrumbs = useMemo(() => {
    const formatSegment = (segment) => {
      if (!segment) return '';
      if (/^\d+$/.test(segment)) {
        return 'Detail';
      }
      const formatted = segment.replace(/[-_]/g, ' ');
      return formatted.replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0 || location.pathname === '/') {
      return [{ label: 'Home', href: undefined, icon: Home, isCurrent: true }];
    }

    let pathAccumulator = '';
    const crumbs = segments.map((segment, index) => {
      pathAccumulator += `/${segment}`;
      const mapped = routeLabels[pathAccumulator];
      const label = mapped || formatSegment(segment);
      return {
        label,
        href: pathAccumulator,
        isCurrent: false
      };
    });

    if (crumbs.length > 0) {
      crumbs[crumbs.length - 1].isCurrent = true;
      crumbs[crumbs.length - 1].href = undefined;
    }

    if (location.pathname === '/admin') {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      if (tab) {
        const pathKey = `/admin/${tab}`;
        const label = routeLabels[pathKey] || formatSegment(tab);
        if (crumbs.length > 0) {
          crumbs[crumbs.length - 1].isCurrent = false;
          crumbs[crumbs.length - 1].href = '/admin';
        }
        crumbs.push({
          label,
          href: undefined,
          isCurrent: true
        });
      }
    }

    const breadcrumbTrail = [
      { label: 'Home', href: '/', icon: Home, isCurrent: false },
      ...crumbs
    ];
    return breadcrumbTrail;
  }, [location.pathname, location.search, routeLabels]);

  const derivedBreadcrumbs = useMemo(() => {
    if (breadcrumbs && breadcrumbs.length > 0) {
      return breadcrumbs;
    }
    if (pageTitle) {
      if (location.pathname === '/' && pageTitle.toLowerCase() === 'home') {
        return [{ label: 'Home', href: undefined, icon: Home, isCurrent: true }];
      }
      return [
        { label: 'Home', href: '/', icon: Home, isCurrent: false },
        { label: pageTitle, href: location.pathname, isCurrent: true }
      ];
    }
    return autoBreadcrumbs;
  }, [autoBreadcrumbs, breadcrumbs, pageTitle, location.pathname]);

  const isAdmin = user?.role === 'admin';
  const isObserver = user?.role === 'observer';

  useEffect(() => {
    const handleClickAway = (event) => {
      const target = event.target;
      const profileContainers = [desktopProfileRef.current, mobileProfileRef.current].filter(Boolean);
      if (!profileContainers.some((ref) => ref.contains(target))) {
        setProfileOpen(false);
      }
      const inDesktop = desktopStatusRef.current && desktopStatusRef.current.contains(target);
      const inMobile = mobileStatusRef.current && mobileStatusRef.current.contains(target);
      if (!inDesktop && !inMobile) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  useEffect(() => {
    setProfileOpen(false);
    setStatusMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (isObserver) {
      setStatusMenuOpen(false);
    }
  }, [isObserver]);

  const mainOffset = isCollapsed ? 'md:ml-20' : 'md:ml-60';
  const layoutBackground = isAdmin ? 'bg-neutral-50' : 'bg-slate-100';
  const headerBorder = isAdmin ? 'border-rose-300' : 'border-slate-200';
  const headerBackground = isAdmin ? 'bg-gradient-to-r from-rose-50 via-white to-white' : 'bg-white/95';
  const logoAccent = isAdmin ? 'text-rose-600' : 'text-primary-600';
  const profileAccent = isAdmin ? 'bg-rose-500' : 'bg-primary-500';
  const breadcrumbCurrent = isAdmin ? 'text-rose-700' : 'text-slate-700';
  const dividerColor = isAdmin ? 'bg-rose-200/80' : 'bg-slate-200';
  const roleLabel = useMemo(() => {
    if (!user?.role) return null;
    if (user.role === 'admin') return 'ADMIN';
    return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  }, [user?.role]);

  const roleBadgeVariant = useMemo(() => {
    switch (user?.role) {
      case 'admin':
        return 'bg-rose-100 text-rose-700 border-rose-300';
      case 'doctor':
        return 'bg-primary-100 text-primary-700 border-primary-200';
      case 'researcher':
        return 'bg-success-100 text-success-700 border-success-200';
      case 'observer':
        return 'bg-warning-100 text-warning-700 border-warning-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }, [user?.role]);

  const hasAdditionalRoles = Array.isArray(user?.roles) && user.roles.length > 1;
  const isRootPath = location.pathname === '/';
  const showBreadcrumbs =
    derivedBreadcrumbs.length > 1 || (isRootPath && derivedBreadcrumbs.length === 1);

  const pacsStatusMeta = useMemo(() => {
    switch (pacsHealth.status) {
      case 'online':
      case 'unknown':
        return {
          icon: <CircleDot className="h-3.5 w-3.5 text-success-600" />,
          label: 'Connected'
        };
      case 'error':
        return {
          icon: <Circle className="h-3.5 w-3.5 text-warning-600" />,
          label: 'Degraded'
        };
      case 'offline':
        return {
          icon: <Slash className="h-3.5 w-3.5 text-error-600" />,
          label: 'Offline'
        };
      case 'checking':
      default:
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />,
          label: 'Checking'
        };
    }
  }, [pacsHealth.status]);

  const pacsTitle = pacsHealth.message + (pacsHealth.responseTime ? ` (${pacsHealth.responseTime}ms)` : '');

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={`min-h-screen ${layoutBackground} text-neutral-900`}>
      <header className={`sticky top-0 z-40 border-b ${headerBorder} ${headerBackground} backdrop-blur`}>
        <div className="mx-auto w-full px-4 py-1 sm:px-6 sm:py-1 lg:px-8">
          <div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-4">
            <div className="flex items-center gap-3 md:col-span-9 md:min-w-0">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 md:hidden"
                aria-label="Open navigation"
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link to="/" className="flex items-center gap-2 rounded-md px-2 py-1 transition">
                <img src={companyLogo} alt="ChickadeeX" className="h-11 w-11 object-contain" />
                <span className={`hidden text-sm font-semibold tracking-wide sm:inline ${logoAccent}`}>
                  ChickadeeX
                </span>
              </Link>
              {showBreadcrumbs && (
                <>
                  <span
                    className={`hidden text-sm font-semibold md:block ${isAdmin ? 'text-rose-300' : 'text-slate-300'}`}
                    aria-hidden="true"
                  >
                    |
                  </span>
                  <nav
                    aria-label="Breadcrumb"
                    className={`hidden min-w-0 flex-1 items-center text-xs font-medium md:flex ${isAdmin ? 'text-rose-600' : 'text-slate-500'}`}
                  >
                    <ol className="flex max-w-full items-center gap-2">
                      {derivedBreadcrumbs.map((crumb, index) => {
                        const isLink = Boolean(crumb.href) && !crumb.isCurrent;
                        const crumbContent = (
                          <span
                            className={`truncate transition-colors ${crumb.isCurrent ? `${breadcrumbCurrent} font-semibold` : isAdmin ? 'hover:underline hover:text-rose-700' : 'hover:underline hover:text-slate-700'}`}
                            title={crumb.label}
                            aria-current={crumb.isCurrent ? 'page' : undefined}
                          >
                            {crumb.label}
                          </span>
                        );
                        return (
                          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                            {index === 0 && (
                              <Home className={`h-3.5 w-3.5 flex-shrink-0 ${isAdmin ? 'text-rose-400' : 'text-slate-400'}`} />
                            )}
                            {isLink ? (
                              <button
                                type="button"
                                onClick={() => navigate(crumb.href)}
                                className={`inline-flex items-center gap-1 rounded-sm transition focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 ${isAdmin ? 'text-rose-500 hover:underline hover:text-rose-700' : 'text-slate-500 hover:underline hover:text-slate-700'}`}
                              >
                                {crumbContent}
                              </button>
                            ) : (
                              crumbContent
                            )}
                            {index < derivedBreadcrumbs.length - 1 && (
                              <ChevronRight className={`h-3 w-3 flex-shrink-0 ${isAdmin ? 'text-rose-200' : 'text-slate-300'}`} />
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                </>
              )}
            </div>

            <div className="hidden md:col-span-3 md:flex md:items-center md:justify-end md:gap-6">
              <div className="flex items-center gap-4">
                {!isObserver && roleLabel && (
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide shadow-sm transition ${roleBadgeVariant} focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2`}
                    title={`You're viewing the ${roleLabel} workspace.`}
                  >
                    {roleLabel}
                    {hasAdditionalRoles && <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
                {isObserver && (
                  <Link
                    to="/guide"
                    className="inline-flex items-center gap-2 rounded-full border border-primary-300 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-12px_rgba(37,99,235,0.65)] focus:outline-none focus:ring-4 focus:ring-blue-500/30"
                  >
                    Guide
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
                {!isObserver && (
                  <div ref={desktopStatusRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setStatusMenuOpen((prev) => !prev)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide shadow-sm transition ${pacsColors.border} ${pacsColors.bg} ${pacsColors.text} hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2`}
                      title={pacsTitle}
                      aria-expanded={statusMenuOpen}
                    >
                      {pacsStatusMeta.icon}
                      <span>PACS</span>
                    </button>
                    {statusMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white shadow-lg">
                        <div className="px-4 py-3 text-sm text-slate-700">
                          <p className="font-semibold text-slate-800">PACS Status</p>
                          <p className="mt-1 text-xs text-slate-500">{pacsHealth.message}</p>
                          {pacsHealth.responseTime && (
                            <p className="mt-2 text-xs text-slate-400">Latency: {pacsHealth.responseTime}ms</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusMenuOpen(false);
                            navigate('/admin/pacs-settings');
                          }}
                          className="flex w-full items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-primary-600 transition hover:bg-primary-50"
                        >
                          Open PACS Settings
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div ref={desktopProfileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white ${profileAccent}`}>
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                  <span className="hidden items-center gap-1 text-left sm:flex">
                    <span className="max-w-[7rem] truncate">{user?.name}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </span>
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-xl">
                    {!isObserver && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/profile');
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                      >
                        Profile
                        <span className="text-xs uppercase tracking-wide text-slate-400">{user?.role}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        handleSignOut();
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-slate-100 ${isAdmin ? 'text-rose-600' : 'text-primary-600'}`}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Responsive layout for < md screens */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
              aria-label="Open navigation"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="flex items-center gap-2 rounded-md px-2 py-1 transition">
              <img src={companyLogo} alt="ChickadeeX" className="h-10 w-10 object-contain" />
              <span className={`text-sm font-semibold tracking-wide ${logoAccent}`}>ChickadeeX</span>
            </Link>
            <div className="flex items-center gap-2">
              {isObserver && (
                <Link
                  to="/guide"
                  className="inline-flex items-center gap-2 rounded-full border border-primary-300 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-12px_rgba(37,99,235,0.65)] focus:outline-none focus:ring-4 focus:ring-blue-500/30"
                >
                  Guide
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
              {!isObserver && (
                <div ref={mobileStatusRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
                    aria-expanded={statusMenuOpen}
                    title="Workspace & system status"
                  >
                    {pacsStatusMeta.icon}
                    Status
                    {statusMenuOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {statusMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white shadow-lg">
                      {roleLabel && (
                        <div className="border-b border-slate-200 px-4 py-3 text-sm">
                          <p className="font-semibold text-slate-800">Workspace</p>
                          <p className="mt-1 inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-wide">
                            {roleLabel}
                          </p>
                        </div>
                      )}
                      <div className="px-4 py-3 text-sm text-slate-700">
                        <p className="font-semibold text-slate-800">PACS Status</p>
                        <p className="mt-1 text-xs text-slate-500">{pacsHealth.message}</p>
                        {pacsHealth.responseTime && (
                          <p className="mt-2 text-xs text-slate-400">Latency: {pacsHealth.responseTime}ms</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusMenuOpen(false);
                          navigate('/admin/pacs-settings');
                        }}
                        className="flex w-full items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-primary-600 transition hover:bg-primary-50"
                      >
                        Open PACS Settings
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div ref={mobileProfileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white ${profileAccent}`}>
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-xl">
                    {!isObserver && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/profile');
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                      >
                        Profile
                        <span className="text-xs uppercase tracking-wide text-slate-400">{user?.role}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        handleSignOut();
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-slate-100 ${isAdmin ? 'text-rose-600' : 'text-primary-600'}`}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showBreadcrumbs && (
            <nav aria-label="Breadcrumb" className="mt-2">
              <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                {derivedBreadcrumbs.map((crumb, index) => {
                  const isLink = Boolean(crumb.href) && !crumb.isCurrent;
                  const content = (
                    <span
                      className={`truncate ${crumb.isCurrent ? `${breadcrumbCurrent} font-semibold` : 'hover:underline hover:text-slate-700'}`}
                      title={crumb.label}
                      aria-current={crumb.isCurrent ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  );
                  return (
                    <li key={`${crumb.label}-${index}`} className="flex items-center gap-2 min-w-0">
                      {index === 0 && <Home className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />}
                      {isLink ? (
                        <button
                          type="button"
                          onClick={() => navigate(crumb.href)}
                          className="inline-flex items-center gap-1 text-slate-500 transition hover:underline hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 rounded-sm"
                        >
                          {content}
                        </button>
                      ) : (
                        content
                      )}
                      {index < derivedBreadcrumbs.length - 1 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-slate-300" />}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>
      </header>

      <div className="flex">
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
          isMobileOpen={isMobileSidebarOpen}
          setIsMobileOpen={setIsMobileSidebarOpen}
        />

        <div className={`flex min-h-[calc(100vh-4rem)] flex-1 flex-col transition-all duration-300 ${mainOffset}`}>
          <main className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
