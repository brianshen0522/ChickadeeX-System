import React, { createContext, useContext, useState } from 'react';

const PageContext = createContext();

export const usePageContext = () => {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error('usePageContext must be used within a PageProvider');
  }
  return context;
};

export const PageProvider = ({ children }) => {
  const [pageTitle, setPageTitle] = useState('');
  const [pageDescription, setPageDescription] = useState('');

  const clearPageData = () => {
    setPageTitle('');
    setPageDescription('');
  };

  return (
    <PageContext.Provider value={{ 
      pageTitle, 
      setPageTitle, 
      pageDescription, 
      setPageDescription,
      clearPageData 
    }}>
      {children}
    </PageContext.Provider>
  );
};