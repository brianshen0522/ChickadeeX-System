import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStatistics } from '../services/adminService';

export const useHealthStatus = () => {
  const { user } = useAuth();
  const [systemHealth, setSystemHealth] = useState({
    status: 'online',
    healthy: true,
    message: 'System Online'
  });
  
  const [pacsHealth, setPacsHealth] = useState({
    status: 'checking',
    healthy: false,
    message: 'Checking PACS...'
  });

  const checkHealth = useCallback(async () => {
    try {
      // Only check PACS health if user is admin (statistics endpoint requires admin)
      if (user?.role === 'admin') {
        const stats = await getStatistics();
        setPacsHealth({
          status: stats.pacs_healthy ? 'online' : 'offline',
          healthy: stats.pacs_healthy,
          message: stats.pacs_healthy ? 'PACS Online' : 'PACS Offline'
        });
      } else {
        // For non-admin users, show a generic status
        setPacsHealth({
          status: 'unknown',
          healthy: true,
          message: 'PACS Status'
        });
      }
    } catch (error) {
      console.error('Health check failed:', error);
      setPacsHealth({
        status: 'error',
        healthy: false,
        message: 'PACS Check Failed'
      });
    }
  }, [user]);

  useEffect(() => {
    // Initial health check
    checkHealth();
    
    // Set up periodic health checks every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    
    return () => clearInterval(interval);
  }, [checkHealth]);

  return {
    systemHealth,
    pacsHealth,
    refreshHealth: checkHealth
  };
};