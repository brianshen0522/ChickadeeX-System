import React from 'react';
import { Menu, Activity } from 'lucide-react';
import { useHealthStatus } from '../../hooks/useHealthStatus';
import companyLogo from '../../assets/logo.svg';

const Header = () => {
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
  
  return (
    <div className="relative z-10 flex-shrink-0 flex h-16 bg-gradient-to-r from-primary-50 to-medical-off-white shadow-medical border-b border-primary-200">
      <button className="px-4 border-r border-primary-200 text-primary-600 hover:text-primary-800 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 md:hidden transition-all duration-200">
        <Menu className="h-6 w-6" />
      </button>
      
      <div className="flex-1 px-6 flex justify-between items-center">
        <div className="flex-1 flex items-center">
          {/* Company Logo Header */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-white rounded-medical shadow-soft border border-primary-200">
              <img 
                src={companyLogo} 
                alt="ChickadeeX" 
                className="h-6 w-6 object-contain"
              />
            </div>
            <div className="hidden sm:block">
              <h2 className="text-sm font-semibold text-primary-800">ChickadeeX</h2>
              <p className="text-xs text-primary-600">Medical Imaging Reports</p>
            </div>
          </div>
        </div>
        
        {/* Real-time Health Status Indicators */}
        <div className="flex items-center space-x-3">
          {/* System Online Status */}
          <div className="flex items-center space-x-2 px-3 py-2 bg-success-50 border border-success-200 rounded-medical shadow-soft">
            <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-success-800">{systemHealth.message}</span>
          </div>
          
          {/* PACS Health Status - Real API Check */}
          <div className={`flex items-center space-x-2 px-3 py-2 ${pacsColors.bg} border ${pacsColors.border} rounded-medical shadow-soft`}>
            <div className={`w-2 h-2 ${pacsColors.dot} rounded-full ${pacsHealth.healthy ? 'animate-pulse' : ''}`}></div>
            <span className={`text-xs font-medium ${pacsColors.text}`}>
              {pacsHealth.message}
              {pacsHealth.responseTime && pacsHealth.healthy && (
                <span className="ml-1 opacity-75">({pacsHealth.responseTime}ms)</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
