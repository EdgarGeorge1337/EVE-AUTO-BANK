'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function formatISK(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

interface Props {
  loanId: string;
  status: string;
  cancellationFee: number;
  insurancePremium: number;
}

export function CancelLoanButton({ loanId, status, cancellationFee, insurancePremium }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const totalCost = cancellationFee + insurancePremium;
  const isFree = status === 'PENDING';

  async function handleCancel() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/loans/${loanId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to cancel');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-red-500/40 hover:border-red-500 text-red-400 hover:text-red-300 px-4 py-2 rounded text-sm transition-colors"
      >
        Cancel Loan
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-5">
            <h2 className="text-lg font-bold text-white">Cancel Loan</h2>

            {isFree ? (
              <p className="text-slate-300 text-sm">
                Your application is still pending — cancellation is <strong className="text-white">free</strong>. No fees apply.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-slate-300">
                  Cancelling an active loan incurs a fee. The following will be deducted from your repayment or owed separately:
                </p>
                <div className="bg-slate-800 rounded p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cancellation fee (5%)</span>
                    <span className="text-white">{formatISK(cancellationFee)}</span>
                  </div>
                  {insurancePremium > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Insurance premium (non-refundable)</span>
                      <span className="text-white">{formatISK(insurancePremium)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-700 pt-1.5 font-semibold">
                    <span className="text-slate-300">Total cost</span>
                    <span className="text-red-400">{formatISK(totalCost)}</span>
                  </div>
                </div>
                <p className="text-slate-500 text-xs">
                  Your PLEX collateral will be returned after fees are settled.
                </p>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 border border-slate-600 hover:border-slate-400 text-slate-300 px-4 py-2 rounded text-sm transition-colors"
              >
                Keep Loan
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded text-sm transition-colors"
              >
                {loading ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
