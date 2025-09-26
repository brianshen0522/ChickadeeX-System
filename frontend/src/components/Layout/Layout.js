import React, { useState, useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import { usePageContext } from '../../contexts/PageContext';
import { useHealthStatus } from '../../hooks/useHealthStatus';

const Layout = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { pageTitle, pageDescription } = usePageContext();
  const { systemHealth, pacsHealth } = useHealthStatus();

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

  // Lock body scroll for better UX
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, []);

  return (
    <div className="h-screen bg-neutral-50 flex overflow-hidden">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <div className={`flex flex-col flex-1 ${isCollapsed ? 'md:ml-16' : 'md:ml-64'} transition-all duration-300 min-h-0`}>
        {/* Medical Header */}
        <div className="sticky top-0 z-20 bg-gradient-to-r from-primary-50 to-medical-off-white border-b border-primary-200 shadow-medical">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="inline-flex items-center justify-center rounded-medical p-2 text-primary-600 hover:text-primary-800 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200 shadow-soft"
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </button>
              {pageTitle && (
                <div className="flex items-center">
                  <div className="h-8 w-px bg-primary-300 mr-4"></div>
                  <div>
                    <h1 className="text-lg font-semibold text-primary-900">{pageTitle}</h1>
                    {pageDescription && (
                      <p className="text-sm text-primary-600 mt-0.5">{pageDescription}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* PACS Status Only */}
            <div className="hidden md:flex items-center">
              <div className={`flex items-center space-x-2 px-3 py-1.5 ${pacsColors.bg} border ${pacsColors.border} rounded-medical shadow-soft`}>
                <div className={`w-2 h-2 ${pacsColors.dot} rounded-full ${pacsHealth.healthy ? 'animate-pulse' : ''}`}></div>
                <span className={`text-xs font-medium ${pacsColors.text}`}>
                  PACS
                  {pacsHealth.responseTime && pacsHealth.healthy && (
                    <span className="ml-1 opacity-75">({pacsHealth.responseTime}ms)</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area with Medical Styling */}
        <main className="flex-1 overflow-hidden bg-gradient-to-br from-neutral-50 to-primary-50">
          <div className="h-full flex flex-col">
            <div className="flex-1 px-4 sm:px-6 md:px-8 py-6 overflow-hidden">
              <div className="max-w-7xl mx-auto h-full">
                <div className="card-medical h-full overflow-hidden">
                  <div className="h-full p-6 scrollbar-medical overflow-auto">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
