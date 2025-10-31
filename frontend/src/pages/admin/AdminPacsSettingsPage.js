import React, { useEffect } from 'react';
import AdminPage from '../AdminPage';
import { usePageContext } from '../../contexts/PageContext';

const AdminPacsSettingsPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();

  useEffect(() => {
    setPageTitle('PACS Settings');
    setPageDescription('Configure DICOM connectivity, authentication, and performance safeguards.');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Administration', href: '/admin' },
      { label: 'PACS Settings', href: undefined, isCurrent: true }
    ]);
  }, [setBreadcrumbs, setPageDescription, setPageTitle]);

  return (
    <AdminPage initialTab="pacs" standalone />
  );
};

export default AdminPacsSettingsPage;
