/*
 * SecureBank Ledger — frontend/src/pages/Dashboard.tsx
 * Balance summary, recent transactions, loan status, charts
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../utils/api';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';

// Mock data for chart demonstration
const balanceHistory = [
  { date: 'Jan', balance: 45000 },
  { date: 'Feb', balance: 52000 },
  { date: 'Mar', balance: 49000 },
  { date: 'Apr', balance: 63000 },
  { date: 'May', balance: 58000 },
  { date: 'Jun', balance: 71000 },
];

const txnVolume = [
  { date: 'Mon', credit: 12000, debit: 8000 },
  { date: 'Tue', credit: 8000, debit: 15000 },
  { date: 'Wed', credit: 22000, debit: 5000 },
  { date: 'Thu', credit: 6000, debit: 12000 },
  { date: 'Fri', credit: 18000, debit: 9000 },
  { date: 'Sat', credit: 4000, debit: 3000 },
  { date: 'Sun', credit: 2000, debit: 1000 },
];

interface StatCard {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
}

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const Dashboard: React.FC = () => {
  const { userId, role } = useAuthStore();

  const stats: StatCard[] = [
    {
      label: 'Total Balance',
      value: '₹71,450.00',
      change: '+12.3%',
      positive: true,
      icon: <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>,
    },
    {
      label: 'Active Accounts',
      value: '3',
      change: '+1 this month',
      positive: true,
      icon: <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>,
    },
    {
      label: 'Monthly Spend',
      value: '₹12,340.00',
      change: '-5.2%',
      positive: false,
      icon: <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>,
    },
    {
      label: 'Active Loans',
      value: '1',
      change: 'EMI due in 8 days',
      positive: false,
      icon: <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>,
    },
  ];

  const recentTxns = [
    { id: 'TXN-001', type: 'CREDIT', amount: 5000, desc: 'Salary deposit', date: '2026-05-24' },
    { id: 'TXN-002', type: 'DEBIT', amount: 1200, desc: 'Utility bill', date: '2026-05-23' },
    { id: 'TXN-003', type: 'TRANSFER', amount: 3000, desc: 'Transfer to savings', date: '2026-05-22' },
    { id: 'TXN-004', type: 'CREDIT', amount: 500, desc: 'Interest earned', date: '2026-05-21' },
    { id: 'TXN-005', type: 'DEBIT', amount: 800, desc: 'Grocery', date: '2026-05-20' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Good morning, <span className="text-gradient">{userId}</span> 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · Role: <span className="text-brand-400 font-medium">{role}</span>
          </p>
        </div>
        <div className="badge badge-green text-sm px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Network: Online
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card-hover p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</span>
              <div className="w-9 h-9 rounded-xl bg-surface-200/50 flex items-center justify-center">
                {stat.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
            <p className={`text-xs mt-1 flex items-center gap-1 ${stat.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stat.positive ? <ChevronUpIcon /> : <ChevronDownIcon />}
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Balance over time */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Balance Over Time</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={balanceHistory}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#818cf8' }}
                formatter={(v: number) => [`₹${v.toLocaleString()}`, 'Balance']}
              />
              <Area type="monotone" dataKey="balance" stroke="#6366f1" fill="url(#balanceGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction volume */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Weekly Transaction Volume</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={txnVolume} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="credit" name="Credit" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Bar dataKey="debit" name="Debit" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="p-5 border-b border-surface-200/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Recent Transactions</h2>
          <a href="/accounts" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base" aria-label="Recent transactions">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map((txn) => (
                <tr key={txn.id}>
                  <td className="font-mono text-xs text-slate-400">{txn.id}</td>
                  <td>
                    <span className={txn.type === 'CREDIT' ? 'badge-green' : txn.type === 'DEBIT' ? 'badge-red' : 'badge-blue'}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="text-slate-300">{txn.desc}</td>
                  <td className={`font-semibold ${txn.type === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {txn.type === 'CREDIT' ? '+' : '-'}₹{txn.amount.toLocaleString()}
                  </td>
                  <td className="text-slate-500 text-xs">{txn.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
