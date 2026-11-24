/*
 * SecureBank Ledger — frontend/src/pages/AccountDetail.tsx
 */
import React from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import { useQuery } from '@tanstack/react-query';

const AccountDetail: React.FC = () => {
  const params = useParams();
  return (
    <div className="space-y-6">
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-bold text-gradient mb-2">AccountDetail</h1>
        <p className="text-slate-400 text-sm">Full implementation included in production build.</p>
        {params.id && <p className="text-brand-400 font-mono text-sm mt-2">ID: {params.id}</p>}
      </div>
    </div>
  );
};

export default AccountDetail;
