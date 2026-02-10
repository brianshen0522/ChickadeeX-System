import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as authService from '../services/authService';
import { setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const hasVerifiedSessionRef = useRef(false);
  const hasUnauthorizedHandlerRef = useRef(false);

  // Check for existing session on mount (but skip on login page)
  useEffect(() => {
    if (location.pathname === '/login') {
      hasVerifiedSessionRef.current = false;
      setIsLoading(false);
      return;
    }

    if (hasVerifiedSessionRef.current) {
      setIsLoading(false);
      return;
    }

    hasVerifiedSessionRef.current = true;
    setIsLoading(true);
    checkAuthStatus();
  }, [location.pathname]);

  useEffect(() => {
    if (!hasUnauthorizedHandlerRef.current) {
      setUnauthorizedHandler(() => {
        if (window.location.pathname !== '/login') {
          logout().finally(() => navigate('/login'));
        }
      });
      hasUnauthorizedHandlerRef.current = true;
    }
  }, [navigate]);

  const checkAuthStatus = async (retryCount = 0) => {
    let authError = null;

    try {
      // Try to get current user - cookie will be sent automatically
      const userData = await authService.getCurrentUser();
      setUser(userData.user);
      setIsAuthenticated(true);
      hasVerifiedSessionRef.current = true;
    } catch (error) {
      authError = error;
      console.error('Auth check failed:', error);

      // Handle specific error cases
      if (error?.response?.status === 401) {
        setUser(null);
        setIsAuthenticated(false);
      } else if (error?.response?.status >= 500 && retryCount < 3) {
        // Retry on server errors with exponential backoff
        console.log(`Retrying auth check (attempt ${retryCount + 1})`);
        setTimeout(() => {
          checkAuthStatus(retryCount + 1);
        }, Math.pow(2, retryCount) * 1000); // 1s, 2s, 4s
        return; // Don't set loading to false yet
      }
      // No need to clear localStorage, cookies are handled by server
    } finally {
      if (retryCount === 0 || !authError || authError?.response?.status < 500) {
        setIsLoading(false);
      }
    }
  };

  const login = async (credentials) => {
    try {
      const response = await authService.login(credentials);
      const { user: userData } = response;
      
      // Cookie is set by server automatically
      setUser(userData);
      setIsAuthenticated(true);
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };



  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Cookie is cleared by server
      setUser(null);
      setIsAuthenticated(false);
      hasVerifiedSessionRef.current = false;
    }
  };

  const refreshToken = async () => {
    try {
      const response = await authService.refreshToken();
      const { user: userData } = response;
      
      // Cookie is refreshed by server automatically
      setUser(userData);
      
      return response;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      throw error;
    }
  };

  // Auto-refresh token before expiry
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        refreshToken().catch(() => {
          // Token refresh failed, user will be logged out
        });
      }, 25 * 60 * 1000); // Refresh every 25 minutes (token expires in 30)

      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshToken,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
