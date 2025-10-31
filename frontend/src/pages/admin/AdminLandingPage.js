import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Cpu, Database, ShieldCheck } from 'lucide-react';
import { usePageContext } from '../../contexts/PageContext';
import { getStatistics, getSystemSettings } from '../../services/adminService';

const AdminLandingPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [metrics, setMetrics] = useState({
    users: { total: 0, active: 0, inactive: 0 },
    llm: { total: 0, enabled: 0, disabled: 0 },
    pacsHealthy: null,
    system: { name: '', backupFrequency: '', maxConcurrent: null }
  });

  useEffect(() => {
    setPageTitle('Administration');
    setPageDescription('');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Administration', href: undefined, isCurrent: true }
    ]);
  }, [setBreadcrumbs, setPageDescription, setPageTitle]);

  useEffect(() => {
    let isMounted = true;
    const loadMetrics = async () => {
      try {
        setLoadingMetrics(true);
        const [stats, systemSettings] = await Promise.all([getStatistics(), getSystemSettings()]);
        if (!isMounted) return;

        setMetrics({
          users: {
            total: stats?.user_counts?.total ?? 0,
            active: stats?.user_counts?.active ?? 0,
            inactive: stats?.user_counts?.inactive ?? 0
          },
          llm: {
            total: stats?.llm_counts?.total ?? stats?.llm_count ?? 0,
            enabled: stats?.llm_counts?.enabled ?? stats?.llm_count ?? 0,
            disabled: stats?.llm_counts?.disabled ?? 0
          },
          pacsHealthy: typeof stats?.pacs_healthy === 'boolean' ? stats.pacs_healthy : null,
          system: {
            name: systemSettings?.system_name || 'Configured',
            backupFrequency: systemSettings?.backup_frequency || '',
            maxConcurrent: systemSettings?.max_concurrent_tasks ?? null
          }
        });
      } catch (error) {
        if (isMounted) {
          setMetrics({
            users: { total: 0, active: 0, inactive: 0 },
            llm: { total: 0, enabled: 0, disabled: 0 },
            pacsHealthy: null,
            system: { name: 'Unavailable', backupFrequency: '', maxConcurrent: null }
          });
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
  }, []);

  const formatNumber = useCallback((value) => {
    if (loadingMetrics) return '—';
    if (value === null || value === undefined) return '0';
    return value.toLocaleString();
  }, [loadingMetrics]);

  const pacsStatus = useMemo(() => {
    if (loadingMetrics || metrics.pacsHealthy === null) {
      return {
        label: 'Checking',
        dot: 'bg-warning-400',
        text: 'text-slate-600',
        badge: 'border-warning-200 bg-warning-50'
      };
    }
    if (metrics.pacsHealthy) {
      return {
        label: 'Online',
        dot: 'bg-success-500',
        text: 'text-success-700',
        badge: 'border-success-200 bg-success-50'
      };
    }
    return {
      label: 'Stopped',
      dot: 'bg-error-500',
      text: 'text-error-700',
      badge: 'border-error-200 bg-error-50'
    };
  }, [loadingMetrics, metrics.pacsHealthy]);

  const adminCards = useMemo(() => ([
    {
      key: 'users',
      title: 'User Directory',
      icon: Users,
      to: '/admin/users',
      iconClasses: 'border-rose-200 bg-rose-50 text-rose-600',
      cta: 'Manage users →',
      ctaClasses: 'text-rose-500 transition group-hover:text-rose-600',
      renderMetrics: () => (
        <>
          <div className="mt-4">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-rose-500">
              Total Users
            </span>
            <p className="mt-2 text-3xl font-semibold text-slate-900 sm:text-[2.3rem]">
              {formatNumber(metrics.users.total)}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-md border border-rose-100 bg-rose-50/60 px-3 py-2">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-rose-500">Active</p>
              <p className="mt-1 text-[1.05rem] font-semibold text-rose-700">
                {formatNumber(metrics.users.active)}
              </p>
            </div>
            <div className="rounded-md border border-rose-100 bg-rose-50/60 px-3 py-2">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-rose-500">Inactive</p>
              <p className="mt-1 text-[1.05rem] font-semibold text-rose-700">
                {formatNumber(metrics.users.inactive)}
              </p>
            </div>
          </div>
        </>
      )
    },
    {
      key: 'llm',
      title: 'LLM Configuration',
      icon: Cpu,
      to: '/admin/llm-config',
      iconClasses: 'border-indigo-200 bg-indigo-50 text-indigo-600',
      cta: 'Configure models →',
      ctaClasses: 'text-indigo-500 transition group-hover:text-indigo-600',
      renderMetrics: () => (
        <>
          <div className="mt-4">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-indigo-500">
              Total Models
            </span>
            <p className="mt-2 text-3xl font-semibold text-slate-900 sm:text-[2.3rem]">
              {formatNumber(metrics.llm.total)}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-indigo-500">Enabled</p>
              <p className="mt-1 text-[1.05rem] font-semibold text-indigo-700">
                {formatNumber(metrics.llm.enabled)}
              </p>
            </div>
            <div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-indigo-500">Disabled</p>
              <p className="mt-1 text-[1.05rem] font-semibold text-indigo-700">
                {formatNumber(metrics.llm.disabled)}
              </p>
            </div>
          </div>
        </>
      )
    },
    {
      key: 'pacs',
      title: 'PACS Settings',
      icon: Database,
      to: '/admin/pacs-settings',
      iconClasses: 'border-emerald-200 bg-emerald-50 text-emerald-600',
      cta: 'Review PACS →',
      ctaClasses: 'text-emerald-500 transition group-hover:text-emerald-600',
      renderMetrics: () => (
        <>
          <div className="mt-4">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-emerald-500">
              Connection Status
            </span>
            <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${pacsStatus.badge}`}>
              <span className={`h-2 w-2 rounded-full ${pacsStatus.dot}`} />
              <span className={pacsStatus.text}>{pacsStatus.label}</span>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600 sm:text-[0.95rem]">
            {loadingMetrics ? 'Verifying PACS availability…' : 'Monitor connectivity and credentials for DICOM proxies.'}
          </p>
        </>
      )
    },
    {
      key: 'system',
      title: 'System Policies',
      icon: ShieldCheck,
      to: '/admin/system-settings',
      iconClasses: 'border-slate-200 bg-slate-50 text-slate-600',
      cta: 'Adjust policies →',
      ctaClasses: 'text-slate-500 transition group-hover:text-slate-600',
      renderMetrics: () => (
        <>
          <div className="mt-4">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-slate-500">
              Environment
            </span>
            <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-[2.05rem]">
              {loadingMetrics ? '—' : metrics.system.name}
            </p>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-600 sm:text-[0.95rem]">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                Backup Frequency
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {loadingMetrics || !metrics.system.backupFrequency
                  ? '—'
                  : metrics.system.backupFrequency}
              </p>
            </div>
            {metrics.system.maxConcurrent !== null && (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Max Concurrent Tasks
                </p>
                <p className="mt-1 font-semibold text-slate-700">
                  {formatNumber(metrics.system.maxConcurrent)}
                </p>
              </div>
            )}
          </div>
        </>
      )
    }
  ]), [formatNumber, loadingMetrics, metrics, pacsStatus]);

  return (
    <div className="flex flex-col space-y-4 sm:space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {adminCards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-rose-100 bg-white p-5 shadow-sm transition ease-out hover:-translate-y-1 hover:border-rose-200 hover:shadow-medical"
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${card.iconClasses}`}>
                <card.icon className="h-[18px] w-[18px]" />
              </div>
              <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-rose-600 transition group-hover:border-rose-200 group-hover:bg-rose-100">
                Open
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900 sm:text-lg">{card.title}</h2>
            <div className="flex-1">{card.renderMetrics()}</div>
            <div className={`mt-4 text-sm font-semibold ${card.ctaClasses}`}>
              {card.cta}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdminLandingPage;
