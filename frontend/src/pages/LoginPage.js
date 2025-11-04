import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Lock, Mail, KeyRound } from 'lucide-react';
import { FaGoogle } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import companyLogo from '../assets/logo.svg';
import * as authService from '../services/authService';

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
    const publicProtocol = (process.env.REACT_APP_PUBLIC_PROTOCOL || window.location.protocol.replace(':', '')).replace(/:$/, '');
    const publicHost = process.env.REACT_APP_PUBLIC_HOSTNAME || window.location.hostname;
    const keycloakPort = process.env.REACT_APP_KEYCLOAK_PORT || '8080';

    const keycloakUrl = process.env.REACT_APP_KEYCLOAK_URL || `${publicProtocol}://${publicHost}:${keycloakPort}`;
    const realm = process.env.REACT_APP_KEYCLOAK_REALM || 'medical-reports';
    const clientId = process.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'medical-reports-client';
    const apiBase = process.env.REACT_APP_API_URL || `${publicProtocol}://${publicHost}:3000`;
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

  const handleForgotPassword = () => {
    toast.info('Please contact your administrator to reset your password.');
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ssoSuccess = params.get('sso_success');
    const error = params.get('error');
    const sessionToken = params.get('session_token');
    const expiresIn = params.get('expires_in');

    if (sessionToken) {
      authService.storeAuthToken(sessionToken);
      const cleanParams = new URLSearchParams(params);
      cleanParams.delete('session_token');
      if (expiresIn) {
        cleanParams.delete('expires_in');
      }
      const newSearch = cleanParams.toString();
      window.history.replaceState({}, '', `${location.pathname}${newSearch ? `?${newSearch}` : ''}`);
    }

    if (error) {
      toast.error('SSO login failed');
    }

    if (ssoSuccess) {
      (async () => {
        setIsLoading(true);
        try {
          await completeSSOLogin();
          toast.success('Login successful!');
          navigate('/', { replace: true });
        } catch (e) {
          toast.error('SSO login failed');
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [location.search, completeSSOLogin, navigate]);

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Branding Area */}
        <aside className="flex w-full flex-col items-center justify-center bg-gradient-to-br from-primary-50 via-medical-off-white to-neutral-200 px-6 py-12 text-center md:w-3/5 lg:px-12">
          <div className="max-w-xl space-y-6">
            <img
              src={companyLogo}
              alt="ChickadeeX logo"
              className="mx-auto h-36 w-36 object-contain"
            />
            <div>
              <h1 className="text-3xl font-semibold text-primary-900">ChickadeeX</h1>
              <p className="mt-2 text-base text-primary-600">
                Medical Imaging Reports Platform for Secure Access and AI-Assisted Analysis.
              </p>
            </div>
          </div>
        </aside>

        {/* Login Form Area */}
        <section className="flex w-full items-center justify-center px-6 py-12 sm:px-10 md:w-2/5 md:px-12 lg:px-16">
          <div className="w-full max-w-lg">
              <h2 className="mb-10 text-3xl font-semibold text-neutral-900">Login</h2>

            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-neutral-700">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={`w-full rounded-xl border bg-white px-11 py-3 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        errors.email
                          ? 'border-error-300 bg-error-50 focus:ring-error-500 focus:border-error-500'
                          : 'border-neutral-300 hover:border-primary-400'
                      }`}
                      placeholder="Enter your email"
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address'
                        }
                      })}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-2 flex items-center text-sm text-error-600">
                      <span className="mr-2 h-1 w-1 rounded-full bg-error-600"></span>
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-neutral-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className={`w-full rounded-xl border bg-white px-11 py-3 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        errors.password
                          ? 'border-error-300 bg-error-50 focus:ring-error-500 focus:border-error-500'
                          : 'border-neutral-300 hover-border-primary-400'
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
                  </div>
                  {errors.password && (
                    <p className="mt-2 flex items-center text-sm text-error-600">
                      <span className="mr-2 h-1 w-1 rounded-full bg-error-600"></span>
                      {errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <LoadingSpinner size="small" />
                    <span className="ml-2">Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Lock className="mr-2 h-4 w-4" />
                    Login
                  </div>
                )}
              </button>
            </form>

            <div className="mt-8">
              <div className="text-center text-sm text-neutral-500">Or sign in using</div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center sm:space-x-4 sm:gap-0">
                <button
                  type="button"
                  onClick={handleKeycloakLogin}
                  className="inline-flex items-center justify-center space-x-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 shadow-sm transition hover:bg-primary-100 hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Keycloak</span>
                </button>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="inline-flex items-center justify-center space-x-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-100 hover:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2"
                >
                  <FaGoogle className="h-4 w-4 text-error-500" />
                  <span>Google</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
