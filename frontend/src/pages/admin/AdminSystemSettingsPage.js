import React, { useEffect } from 'react';
import AdminPage from '../AdminPage';
import { usePageContext } from '../../contexts/PageContext';

const AdminSystemSettingsPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();

  useEffect(() => {
    setPageTitle('System Policies');
    setPageDescription('Define platform limits, naming, and backup cadence for ChickadeeX.');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Administration', href: '/admin' },
      { label: 'System Policies', href: undefined, isCurrent: true }
    ]);
  }, [setBreadcrumbs, setPageDescription, setPageTitle]);

  return (
    <AdminPage initialTab="system" standalone />
  );
};

export default AdminSystemSettingsPage;
