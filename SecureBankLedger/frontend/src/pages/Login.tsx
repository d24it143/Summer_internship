/*
 * SecureBank Ledger — frontend/src/pages/Login.tsx
 * Fabric CA enrollment form + JWT storage
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuthStore } from '../stores/authStore';

const schema = z.object({
  userId: z.string().min(3, 'User ID must be at least 3 characters'),
  secret: z.string().min(6, 'Secret must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const enrollMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post('/api/auth/enroll', data);
      return res.data;
    },
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.userId, data.role);
      toast.success(`Welcome back, ${data.userId}!`);
      navigate('/dashboard');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error ?? 'Enrollment failed. Check your credentials.');
    },
  });

  return (
    <div className="min-h-screen bg-surface bg-grid flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-4 shadow-glow">
            <svg className="w-8 h-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6M3 12a9 9 0 1118 0A9 9 0 013 12z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gradient">SecureBank Ledger</h1>
          <p className="text-slate-400 mt-1 text-sm">Powered by Hyperledger Fabric 2.5</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">Sign In</h2>
          <form onSubmit={handleSubmit((d) => enrollMutation.mutate(d))} className="space-y-5" noValidate>
            <div>
              <label className="label" htmlFor="userId">Fabric User ID</label>
              <input
                id="userId"
                type="text"
                placeholder="e.g. bank-admin, customer-001"
                className={`input ${errors.userId ? 'input-error' : ''}`}
                aria-describedby={errors.userId ? 'userId-error' : undefined}
                {...register('userId')}
              />
              {errors.userId && (
                <p id="userId-error" className="text-xs text-red-400 mt-1" role="alert">{errors.userId.message}</p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="secret">Enrollment Secret</label>
              <input
                id="secret"
                type="password"
                placeholder="••••••••"
                className={`input ${errors.secret ? 'input-error' : ''}`}
                aria-describedby={errors.secret ? 'secret-error' : undefined}
                {...register('secret')}
              />
              {errors.secret && (
                <p id="secret-error" className="text-xs text-red-400 mt-1" role="alert">{errors.secret.message}</p>
              )}
            </div>

            <button
              type="submit"
              id="login-submit"
              className="btn-primary w-full py-3 text-base"
              disabled={enrollMutation.isPending}
              aria-busy={enrollMutation.isPending}
            >
              {enrollMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Enrolling...
                </span>
              ) : (
                'Sign In to SecureBank'
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-surface-200">
            <p className="text-xs text-slate-500 text-center">
              🔒 Secured with X.509 certificates & Mutual TLS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
