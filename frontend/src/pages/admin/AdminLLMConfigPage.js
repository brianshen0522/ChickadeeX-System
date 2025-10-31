import React, { useEffect } from 'react';
import AdminPage from '../AdminPage';
import { usePageContext } from '../../contexts/PageContext';

const AdminLLMConfigPage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();

  useEffect(() => {
    setPageTitle('LLM Configuration');
    setPageDescription('Curate AI providers, prompts, and prioritisation for assisted reporting.');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Administration', href: '/admin' },
      { label: 'LLM Configuration', href: undefined, isCurrent: true }
    ]);
  }, [setBreadcrumbs, setPageDescription, setPageTitle]);

  return (
    <AdminPage initialTab="llm" standalone />
  );
};

export default AdminLLMConfigPage;
