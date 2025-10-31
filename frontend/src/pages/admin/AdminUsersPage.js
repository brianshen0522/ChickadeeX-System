import React, { useEffect } from 'react';
import AdminPage from '../AdminPage';
import { usePageContext } from '../../contexts/PageContext';

const AdminUsersPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();

  useEffect(() => {
    setPageTitle('User Directory');
    setPageDescription('Manage workspace membership, role assignments, and credential resets.');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Administration', href: '/admin' },
      { label: 'User Directory', href: undefined, isCurrent: true }
    ]);
  }, [setBreadcrumbs, setPageDescription, setPageTitle]);

  return (
    <AdminPage initialTab="users" standalone />
  );
};

export default AdminUsersPage;
