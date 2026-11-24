/*
 * SecureBank Ledger — frontend/src/pages/Accounts.tsx
 * Account list with create modal and freeze action
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuthStore } from '../stores/authStore';

const CreateSchema = z.object({
  customerId: z.string().min(1),
  accountType: z.enum(['SAVINGS','CURRENT','FIXED']),
  initialDeposit: z.number().min(0),
  currency: z.string().length(3),
});
type FormData = z.infer<typeof CreateSchema>;

const statusBadge = (status: string) => ({
  ACTIVE: 'badge-green', FROZEN: 'badge-yellow', CLOSED: 'badge-gray',
}[status] ?? 'badge-gray');

const Accounts: React.FC = () => {
  const { userId, role } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/api/accounts');
      return res.data;
    },
    enabled: true,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { currency: 'INR', initialDeposit: 0 },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post('/api/accounts', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Account created successfully!');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setShowModal(false);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to create account'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Accounts</h1>
          <p className="text-slate-400 text-sm mt-1">Manage bank accounts on the blockchain ledger</p>
        </div>
        {(role === 'ADMIN' || role === 'TELLER') && (
          <button id="create-account-btn" onClick={() => setShowModal(true)} className="btn-primary">
            + New Account
          </button>
        )}
      </div>

      <div className="card">
        <div className="p-5 border-b border-surface-200/50">
          <h2 className="text-sm font-semibold text-slate-300">All Accounts</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <p className="text-4xl mb-2">🏦</p>
            <p>No accounts found. Create one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base" aria-label="Accounts list">
              <thead>
                <tr>
                  <th>Account ID</th><th>Customer</th><th>Type</th>
                  <th>Balance</th><th>KYC</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc: any) => (
                  <tr key={acc.accountId}>
                    <td className="font-mono text-xs text-slate-400">{acc.accountId}</td>
                    <td className="text-slate-300">{acc.customerId}</td>
                    <td><span className="badge badge-blue">{acc.accountType}</span></td>
                    <td className="font-semibold text-slate-100">₹{acc.balance?.toLocaleString()}</td>
                    <td><span className={acc.kycStatus === 'VERIFIED' ? 'badge-green' : 'badge-yellow'}>{acc.kycStatus}</span></td>
                    <td><span className={statusBadge(acc.status)}>{acc.status}</span></td>
                    <td>
                      <Link to={`/accounts/${acc.accountId}`} className="text-xs text-brand-400 hover:text-brand-300">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create Account">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative card p-6 w-full max-w-md animate-in">
            <h3 className="text-lg font-semibold text-slate-100 mb-5">Create New Account</h3>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="label" htmlFor="customerId">Customer ID</label>
                <input id="customerId" className="input" placeholder="CUST-001" {...register('customerId')} />
                {errors.customerId && <p className="text-xs text-red-400 mt-1">{errors.customerId.message}</p>}
              </div>
              <div>
                <label className="label" htmlFor="accountType">Account Type</label>
                <select id="accountType" className="input" {...register('accountType')}>
                  <option value="SAVINGS">Savings</option>
                  <option value="CURRENT">Current</option>
                  <option value="FIXED">Fixed Deposit</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="initialDeposit">Initial Deposit (₹)</label>
                <input id="initialDeposit" type="number" className="input" min={0} {...register('initialDeposit', { valueAsNumber: true })} />
              </div>
              <div>
                <label className="label" htmlFor="currency">Currency</label>
                <input id="currency" className="input" maxLength={3} defaultValue="INR" {...register('currency')} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;
