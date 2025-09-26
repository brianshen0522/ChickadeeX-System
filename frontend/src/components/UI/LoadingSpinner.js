import React from 'react';

const LoadingSpinner = ({ size = 'medium', className = '' }) => {
  const sizeClasses = {
    small: 'h-4 w-4',
    medium: 'h-8 w-8',
    large: 'h-12 w-12'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${sizeClasses[size]} shadow-chickadee`}></div>
    </div>
  );
};

export default LoadingSpinner;