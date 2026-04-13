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
  coverageTier: string;
  coveragePercent: number;
  principalAmount: number;
}

export function FileClaimButton({ loanId, coverageTier, coveragePercent, principalAmount }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const claimAmount = Math.round(principalAmount * coveragePercent);

  async function handleFile() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/loans/${loanId}/insurance-claim`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to file claim');
        setLoading(false);
        return;
      }
      setOpen(false);
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
        className="border border-purple-500/40 hover:border-purple-500 text-purple-400 hover:text-purple-300 px-4 py-2 rounded text-sm transition-colors"
      >
        File Insurance Claim
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-5">
            <h2 className="text-lg font-bold text-white">File Insurance Claim</h2>

            <div className="space-y-3 text-sm">
              <p className="text-slate-300">
                Submit a claim for your <strong className="text-white">{coverageTier}</strong> insurance policy.
                Your claim will be reviewed by an admin before payout is processed.
              </p>
              <div className="bg-slate-800 rounded p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Coverage tier</span>
                  <span className="text-white capitalize">{coverageTier.toLowerCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Coverage percent</span>
                  <span className="text-white">{(coveragePercent * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1.5 font-semibold">
                  <span className="text-slate-300">Expected payout</span>
                  <span className="text-purple-400">{formatISK(claimAmount)}</span>
                </div>
              </div>
              <p className="text-slate-500 text-xs">
                Payout is subject to admin approval. Claims may be denied if the default was due to
                fraudulent activity or policy violations.
              </p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 border border-slate-600 hover:border-slate-400 text-slate-300 px-4 py-2 rounded text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFile}
                disabled={loading}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded text-sm transition-colors"
              >
                {loading ? 'Submitting...' : 'Submit Claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
