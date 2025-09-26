import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { Heart, Shield, Activity, Lock, Stethoscope } from 'lucide-react';
import { FaGoogle } from 'react-icons/fa';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { useNavigate, useLocation } from 'react-router-dom';
import keycloakLogo from '../assets/keycloak-logo.svg';
import companyLogo from '../assets/logo.svg';

const LoginPage = () => {
  const { login, completeSSOLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await login(data);
      toast.success('Login successful!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeycloakLogin = () => {
    // Build Keycloak authorization URL using env vars with safe fallbacks for local dev
    const keycloakUrl = process.env.REACT_APP_KEYCLOAK_URL || 'http://localhost:8080';
    const realm = process.env.REACT_APP_KEYCLOAK_REALM || 'medical-reports';
    const clientId = process.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'medical-reports-client';
    const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    const redirectUri = encodeURIComponent(`${apiBase}/api/auth/sso/redirect`);

    if (!keycloakUrl || !realm || !clientId) {
      toast.error('SSO is not configured. Please set Keycloak env vars.');
      return;
    }

    const scope = encodeURIComponent('openid email profile');
    const authUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&prompt=select_account`;
    window.location.href = authUrl;
  };

  const handleGoogleLogin = () => {
    toast.info('Google login is not yet configured. This is for testing purposes.');
  };

  // Auto-complete SSO if the backend redirected back with an internal token
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ssoSuccess = params.get('sso_success');
    const error = params.get('error');

    if (error) {
      toast.error('SSO login failed');
    }

    if (ssoSuccess) {
      (async () => {
        setIsLoading(true);
        try {
          await completeSSOLogin();
          toast.success('Login successful!');
          navigate('/dashboard', { replace: true });
        } catch (e) {
          console.error('SSO completion error:', e);
          toast.error('SSO login failed');
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [location.search]);

  return (
    <div className="h-screen bg-gradient-to-br from-primary-50 via-medical-off-white to-accent-tech-blue/5 flex items-center justify-center p-4 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230ea5e9' fill-opacity='0.4'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Compact Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-4 mb-4">
            {/* Company Logo */}
            <div className="relative">
              <div className="h-16 w-16 bg-white rounded-medical flex items-center justify-center shadow-medical-lg border border-primary-100">
                <img 
                  src={companyLogo} 
                  alt="ChickadeeX Logo" 
                  className="h-12 w-12 object-contain"
                />
              </div>
              {/* Trust indicator */}
              <div className="absolute -top-1 -right-1 h-5 w-5 bg-success-500 rounded-full flex items-center justify-center shadow-soft">
                <Shield className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            
            <div className="text-left">
              <h1 className="text-3xl font-bold text-primary-800 tracking-tight">ChickadeeX</h1>
              <p className="text-primary-600 font-medium">Medical Imaging Reports</p>
            </div>
          </div>
        </div>

        {/* Streamlined Login Card */}
        <div className="bg-white/90 backdrop-blur-sm border border-primary-100 rounded-medical shadow-medical-xl">

          <div className="p-6">
            {/* Streamlined Login Form */}
            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={`block w-full px-4 py-2.5 border rounded-medical shadow-soft focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-neutral-900 transition-all duration-200 ${
                      errors.email 
                        ? 'border-error-300 focus:ring-error-500 focus:border-error-500 bg-error-50' 
                        : 'border-neutral-300 hover:border-primary-400'
                    }`}
                    placeholder="doctor@hospital.com"
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address'
                      }
                    })}
                  />
                  {errors.email && (
                    <p className="text-error-600 text-sm mt-1 flex items-center">
                      <span className="w-1 h-1 bg-error-600 rounded-full mr-2"></span>
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className={`block w-full px-4 py-2.5 border rounded-medical shadow-soft focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-neutral-900 transition-all duration-200 ${
                      errors.password 
                        ? 'border-error-300 focus:ring-error-500 focus:border-error-500 bg-error-50' 
                        : 'border-neutral-300 hover:border-primary-400'
                    }`}
                    placeholder="Enter your password"
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 6,
                        message: 'Password must be at least 6 characters'
                      }
                    })}
                  />
                  {errors.password && (
                    <p className="text-error-600 text-sm mt-1 flex items-center">
                      <span className="w-1 h-1 bg-error-600 rounded-full mr-2"></span>
                      {errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold py-2.5 px-6 rounded-medical hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 shadow-medical transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <LoadingSpinner size="small" />
                      <span className="ml-2">Signing in...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <Lock className="h-4 w-4 mr-2" />
                      Sign In
                    </div>
                  )}
                </button>
              </div>

              {/* SSO Options */}
              <div className="pt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-white text-neutral-500">or</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={handleKeycloakLogin}
                    className="w-full inline-flex justify-center items-center py-2 px-4 border border-primary-200 rounded-medical text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 hover:border-primary-300 transition-all duration-200 shadow-soft"
                  >
                    <img
                      src={keycloakLogo}
                      alt="SSO"
                      className="h-4 w-4 mr-2"
                    />
                    Hospital SSO
                  </button>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full inline-flex justify-center items-center py-2 px-4 border border-neutral-200 rounded-medical text-sm font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 transition-all duration-200 shadow-soft"
                  >
                    <FaGoogle className="h-4 w-4 text-error-500 mr-2" />
                    Google
                  </button>
                </div>
              </div>
            </form>

            {/* Minimal Security Badges */}
            <div className="pt-6 mt-6 border-t border-neutral-200">
              <div className="flex items-center justify-center space-x-4">
                <div className="inline-flex items-center px-2 py-1 bg-success-100 border border-success-200 rounded-full text-xs text-success-800">
                  <Shield className="h-3 w-3 mr-1" />
                  Secure
                </div>
                <div className="inline-flex items-center px-2 py-1 bg-primary-100 border border-primary-200 rounded-full text-xs text-primary-800">
                  <Lock className="h-3 w-3 mr-1" />
                  Encrypted
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
