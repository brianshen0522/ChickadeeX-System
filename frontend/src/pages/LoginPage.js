import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import companyLogo from '../assets/logo.svg';

const LoginPage = () => {
  const { login } = useAuth();
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
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };



  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('error');

    if (error) {
      toast.error('Login failed');
    }
  }, [location.search]);

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
                  <label htmlFor="username" className="mb-2 block text-sm font-medium text-neutral-700">
                    Username
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      id="username"
                      type="text"
                      autoComplete="username"
                      required
                      className={`w-full rounded-xl border bg-white px-11 py-3 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        errors.username
                          ? 'border-error-300 bg-error-50 focus:ring-error-500 focus:border-error-500'
                          : 'border-neutral-300 hover:border-primary-400'
                      }`}
                      placeholder="Enter your username"
                      {...register('username', {
                        required: 'Username is required'
                      })}
                    />
                  </div>
                  {errors.username && (
                    <p className="mt-2 flex items-center text-sm text-error-600">
                      <span className="mr-2 h-1 w-1 rounded-full bg-error-600"></span>
                      {errors.username.message}
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

          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
