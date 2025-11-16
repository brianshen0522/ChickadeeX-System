import React, { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  X,
  UploadCloud
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Home', href: '/', icon: LayoutDashboard, roles: ['admin', 'doctor', 'researcher', 'observer'] },
  { name: 'Demo', href: '/demo', icon: UploadCloud, roles: ['observer'] },
  {
    name: 'Reports',
    href: '/reports',
    icon: FileText,
    roles: ['admin', 'doctor', 'researcher', 'observer'],
    children: [
      { name: 'Draft', href: '/reports/draft', roles: ['admin', 'doctor', 'researcher', 'observer'] },
      { name: 'Finalized', href: '/reports/finalized', roles: ['admin', 'doctor', 'researcher', 'observer'] }
    ]
  },
  { name: 'Studies', href: '/studies', icon: FolderOpen, roles: ['doctor'] },
  {
    name: 'Administration',
    href: '/admin',
    icon: Settings2,
    roles: ['admin'],
    children: [
      { name: 'Users', href: '/admin/users', roles: ['admin'] },
      { name: 'LLM Config', href: '/admin/llm-config', roles: ['admin'] },
      { name: 'PACS Settings', href: '/admin/pacs-settings', roles: ['admin'] },
      { name: 'System Settings', href: '/admin/system-settings', roles: ['admin'] }
    ]
  }
];

const Sidebar = ({ isCollapsed, onToggleCollapse, isMobileOpen: controlledMobileOpen, setIsMobileOpen: setControlledMobileOpen }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const isMobileOpen = controlledMobileOpen ?? internalMobileOpen;
  const setIsMobileOpen = setControlledMobileOpen ?? setInternalMobileOpen;
  const [expandedMenus, setExpandedMenus] = useState({
    Reports: location.pathname.startsWith('/reports'),
    Administration: location.pathname.startsWith('/admin')
  });

  const navItems = useMemo(() => {
    return NAV_ITEMS
      .filter(item => item.roles.includes(user?.role))
      .map(item => item.children ? {
        ...item,
        children: item.children.filter(child => child.roles.includes(user?.role))
      } : item);
  }, [user?.role]);

  const isAdmin = user?.role === 'admin';
  const sidebarGradient = isAdmin ? 'from-neutral-50 via-white to-white' : 'from-slate-50 via-white to-white';
  const navBase = 'text-slate-600 hover:bg-slate-100 hover:text-slate-800';
  const childBase = 'text-slate-500 hover:bg-slate-100 hover:text-slate-800';
  const navActive = isAdmin ? 'bg-rose-100 text-rose-700 shadow-sm' : 'bg-primary-100 text-primary-700 shadow-sm';

  const matchRoute = (href, { allowChildren = false } = {}) => {
    if (!href) return false;
    const [path, query] = href.split('?');
    const pathMatch =
      location.pathname === path ||
      (allowChildren && location.pathname.startsWith(`${path}/`));
    if (!pathMatch) {
      return false;
    }
    if (!query) {
      return true;
    }
    return location.search === `?${query}`;
  };

  const handleToggle = (item) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [item.name]: true
    }));
    if (item.href) {
      navigate(item.href);
    }
  };

  const isActiveRoute = (href) => matchRoute(href, { allowChildren: true });

  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsMobileOpen(false)} />
          <div className="relative flex w-full max-w-xs flex-col bg-white text-slate-700 shadow-xl">
            <div className="absolute top-0 right-0 -mr-12 pt-4">
              <button
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                onClick={() => setIsMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <MobileNavigation
              navItems={navItems}
              expandedMenus={expandedMenus}
              setExpandedMenus={setExpandedMenus}
              setIsMobileOpen={setIsMobileOpen}
              isAdmin={isAdmin}
              currentPath={location.pathname}
              currentSearch={location.search}
            />
          </div>
        </div>
      )}

      <aside className={`hidden md:flex ${isCollapsed ? 'md:w-20' : 'md:w-60'} md:fixed md:top-16 md:bottom-0 md:h-[calc(100vh-4rem)] md:flex-col transition-all duration-300`}>
        <div className={`flex min-h-0 flex-1 flex-col bg-gradient-to-b ${sidebarGradient} text-slate-700 shadow`}>
          <div className={`flex items-center px-4 py-4 ${isCollapsed ? 'justify-center' : 'justify-end'}`}>
            <button
              type="button"
              onClick={() => onToggleCollapse?.()}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition ${
                isAdmin
                  ? 'border-rose-200 text-rose-500 hover:border-rose-300 hover:bg-rose-50'
                  : 'border-slate-200 hover:border-primary-300 hover:bg-slate-100'
              }`}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-6">
            <div className="space-y-1.5">
              {navItems.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const expanded = expandedMenus[item.name] ?? true;
                const active = hasChildren
                  ? matchRoute(item.href, { allowChildren: true }) ||
                    item.children.some((child) => matchRoute(child.href))
                  : isActiveRoute(item.href);

                if (hasChildren) {
                  return (
                    <div key={item.name}>
                      <button
                        type="button"
                        onClick={() => handleToggle(item)}
                        className={`w-full rounded-xl px-3 py-2 text-sm transition ${navBase} ${active ? navActive : ''} ${isCollapsed ? 'flex justify-center' : 'flex items-center gap-3'}`}
                        title={isCollapsed ? item.name : undefined}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left">{item.name}</span>
                            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          </>
                        )}
                      </button>

                      {!isCollapsed && expanded && (
                        <div className="mt-1 space-y-1 pl-9">
                          {item.children.map((child) => {
                            const childActive = matchRoute(child.href);
                            return (
                              <NavLink
                                key={child.name}
                                to={child.href}
                                className={() =>
                                  `flex items-center rounded-lg px-2.5 py-1.5 text-sm transition ${
                                    childActive ? navActive : childBase
                                  }`
                                }
                              >
                                {child.name}
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      `flex items-center rounded-xl px-3 py-2 text-sm transition ${navBase} ${isActive ? navActive : ''} ${
                        isCollapsed ? 'justify-center' : 'gap-3'
                      }`
                    }
                    title={isCollapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && <span className="flex-1 text-left">{item.name}</span>}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
};

const MobileNavigation = ({ navItems, expandedMenus, setExpandedMenus, setIsMobileOpen, isAdmin, currentPath, currentSearch }) => {
  const navBase = 'text-slate-600 hover:bg-slate-100 hover:text-slate-800';
  const navActive = isAdmin ? 'bg-rose-100 text-rose-700' : 'bg-primary-100 text-primary-700';

  const matchMobileRoute = (href) => {
    if (!href) return false;
    const [path, query] = href.split('?');
    if (currentPath !== path) {
      return false;
    }
    if (!query) {
      return true;
    }
    return currentSearch === `?${query}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-white px-4 py-5 shadow">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Navigation</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-4">
        {navItems.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const expanded = expandedMenus[item.name] ?? true;

          if (hasChildren) {
            return (
              <div key={item.name} className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMenus((prev) => ({
                      ...prev,
                      [item.name]: !prev[item.name]
                    }))
                  }
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <span>{item.name}</span>
                  <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>
                {expanded && (
                  <div className="space-y-1 pl-4">
                    {item.children.map((child) => {
                      const childActive = matchMobileRoute(child.href);
                      return (
                        <NavLink
                          key={child.name}
                          to={child.href}
                          onClick={() => setIsMobileOpen(false)}
                          className={() =>
                            `block rounded-lg px-3 py-2 text-sm transition ${childActive ? navActive : navBase}`
                          }
                        >
                          {child.name}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition ${
                  isActive ? navActive : navBase
                }`
              }
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

export default Sidebar;
