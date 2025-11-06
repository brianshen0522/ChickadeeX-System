import { useEffect } from 'react';
import { usePageContext } from '../contexts/PageContext';

const GuidePage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();

  useEffect(() => {
    setPageTitle('Guide');
    setPageDescription('');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Guide', href: undefined, isCurrent: true }
    ]);
  }, [setPageDescription, setPageTitle, setBreadcrumbs]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-medical">
      {/* TODO: Populate guide content */}
    </div>
  );
};

export default GuidePage;
