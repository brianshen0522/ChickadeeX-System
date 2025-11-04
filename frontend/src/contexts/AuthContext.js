import React, { createContext, useContext, useState, useEffect } from 'react';
import * as authService from '../services/authService';

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

  // Check for existing session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { search } = window.location;
      if (search) {
        const params = new URLSearchParams(search);
        const sessionToken = params.get('session_token');
        if (sessionToken) {
          authService.storeAuthToken(sessionToken);
        }
      }
    }

    authService.bootstrapAuthToken();
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Try to get current user - cookie will be sent automatically
      const userData = await authService.getCurrentUser();
      setUser(userData.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Auth check failed:', error);
      if (error?.response?.status === 401) {
        authService.clearAuthToken();
      }
      // No need to clear localStorage, cookies are handled by server
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials) => {
    try {
      const response = await authService.login(credentials);
      const { user: userData, token } = response;

      if (token) {
        authService.storeAuthToken(token);
      } else {
        authService.clearAuthToken();
      }
      
      // Cookie is set by server automatically
      setUser(userData);
      setIsAuthenticated(true);
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const loginWithSSO = async (accessToken) => {
    try {
      const response = await authService.ssoCallback(accessToken);
      const { user: userData, token } = response;

      if (token) {
        authService.storeAuthToken(token);
      } else {
        authService.clearAuthToken();
      }
      
      // Cookie is set by server automatically
      setUser(userData);
      setIsAuthenticated(true);
      
      return response;
    } catch (error) {
      console.error('SSO login failed:', error);
      throw error;
    }
  };

  // Complete SSO when the backend already issued an internal token
  const completeSSOLogin = async () => {
    try {
      // Just fetch current user - cookie should already be set by server
      const userData = await authService.getCurrentUser();
      setUser(userData.user);
      setIsAuthenticated(true);
      return { user: userData.user };
    } catch (error) {
      console.error('Complete SSO login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      authService.clearAuthToken();
      // Cookie is cleared by server
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const refreshToken = async () => {
    try {
      const response = await authService.refreshToken();
      const { user: userData, token } = response;

      if (token) {
        authService.storeAuthToken(token);
      } else {
        authService.clearAuthToken();
      }
      
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
    loginWithSSO,
    completeSSOLogin,
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
