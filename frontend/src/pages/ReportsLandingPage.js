import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageContext } from '../contexts/PageContext';
import { Clock, CheckCircle } from 'lucide-react';
import { getReportsSummary } from '../services/reportService';

const cards = [
  {
    title: 'Draft Reports',
    description: 'Monitor in-progress reports and continue editing with real-time AI assistance.',
    icon: Clock,
    to: '/reports/draft',
    accent: 'text-warning-600',
    badge: 'bg-warning-100 text-warning-700 border-warning-200',
    cta: 'Review Drafts →'
  },
  {
    title: 'Finalized Reports',
    description: 'Review, export, and audit completed studies ready for distribution.',
    icon: CheckCircle,
    to: '/reports/finalized',
    accent: 'text-success-600',
    badge: 'bg-success-100 text-success-700 border-success-200',
    cta: 'Open Finalized →'
  }
];

const ReportsLandingPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const [summary, setSummary] = useState({
    total_reports: 0,
    draft_reports: 0,
    finalized_reports: 0
  });
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    setPageTitle('Reports');
    setPageDescription('');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Reports', href: undefined, isCurrent: true }
    ]);
  }, [setBreadcrumbs, setPageDescription, setPageTitle]);

  useEffect(() => {
    let isMounted = true;
    const loadSummary = async () => {
      try {
        setLoadingSummary(true);
        const data = await getReportsSummary();
        if (!isMounted) return;
        setSummary({
          total_reports: data.total_reports || 0,
          draft_reports: data.draft_reports || 0,
          finalized_reports: data.finalized_reports || 0
        });
      } catch (error) {
        if (isMounted) {
          setSummary({
            total_reports: 0,
            draft_reports: 0,
            finalized_reports: 0
          });
        }
      } finally {
        if (isMounted) {
          setLoadingSummary(false);
        }
      }
    };

    loadSummary();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col space-y-4 sm:space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Total Reports
            </span>
            <p className="mt-2 text-3xl font-semibold text-slate-900 sm:text-[2.35rem]">
              {loadingSummary ? '—' : summary.total_reports.toLocaleString()}
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-3.5">
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                Drafts
              </span>
              <p className="mt-1.5 text-xl font-semibold text-slate-800 sm:text-[1.55rem]">
                {loadingSummary ? '—' : summary.draft_reports.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-3.5">
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                Finalized
              </span>
              <p className="mt-1.5 text-xl font-semibold text-slate-800 sm:text-[1.55rem]">
                {loadingSummary ? '—' : summary.finalized_reports.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition ease-out hover:-translate-y-1 hover:border-primary-200 hover:shadow-medical"
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-slate-100 ${card.badge}`}>
                <card.icon className={`h-[18px] w-[18px] ${card.accent}`} />
              </div>
              <span className="rounded-full border border-primary-100 bg-primary-50 px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-primary-600 transition group-hover:border-primary-200 group-hover:bg-primary-100">
                Open
              </span>
            </div>
            <div className="mt-4 flex-1">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{card.title}</h2>
              <p className="mt-1 text-sm text-slate-600 sm:text-[0.95rem]">{card.description}</p>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 transition group-hover:text-primary-700">
                {card.cta}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ReportsLandingPage;
