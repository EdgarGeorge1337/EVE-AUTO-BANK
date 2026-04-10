'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface BankDefaults {
  interestRate: number;
  maxLtvRatio: number;
  termDays: number;
  gracePeriodDays: number;
  insuranceRate: number;
  insuranceCoverage: number;
}

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

export default function LoanApplyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [defaults, setDefaults] = useState<BankDefaults | null>(null);
  const [plexPrice, setPlexPrice] = useState<number | null>(null);

  const [principalAmount, setPrincipalAmount] = useState('');
  const [plexQty, setPlexQty] = useState('');
  const [termDays, setTermDays] = useState(30);
  const [wantsInsurance, setWantsInsurance] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/public/defaults').then((r) => r.json()).then(setDefaults);
    fetch('/api/admin/monitoring/plex-price').then((r) => r.json()).then((d) => setPlexPrice(d.price));
  }, []);

  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=/loans/apply');
    return null;
  }

  const principal = parseFloat(principalAmount) || 0;
  const qty = parseInt(plexQty) || 0;
  const collateralValue = plexPrice ? plexPrice * qty : 0;
  const ltv = collateralValue > 0 ? principal / collateralValue : 0;
  const interestRate = defaults?.interestRate ?? 0.08;
  const totalRepayment = principal * (1 + interestRate);
  const insurancePremium = wantsInsurance ? principal * (defaults?.insuranceRate ?? 0.02) : 0;
  const maxLtv = defaults?.maxLtvRatio ?? 0.70;
  const ltvOk = ltv > 0 && ltv <= maxLtv;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ltvOk) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/loans/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principalAmount: principal, plexQty: qty, termDays, wantsInsurance }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Application failed');
      } else {
        router.push(`/loans/${data.loanId}?applied=true`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Apply for a Loan</h1>
        <p className="text-slate-400 mt-2">
          PLEX-secured ISK lending at {((defaults?.interestRate ?? 0.08) * 100).toFixed(0)}% flat rate.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Principal */}
        <div className="eve-card space-y-4">
          <h2 className="font-semibold text-white">Loan Amount</h2>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Principal (ISK)</label>
            <input
              type="number"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              placeholder="e.g. 5000000000"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 outline-none"
              required
              min={1}
            />
            {principal > 0 && <div className="text-xs text-slate-400 mt-1">{formatISK(principal)}</div>}
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Loan Term (days)</label>
            <select
              value={termDays}
              onChange={(e) => setTermDays(parseInt(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none"
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </div>
        </div>

        {/* Collateral */}
        <div className="eve-card space-y-4">
          <h2 className="font-semibold text-white">PLEX Collateral</h2>
          {plexPrice && (
            <div className="text-sm text-slate-400">
              Current PLEX price: <span className="text-amber-400 font-semibold">{formatISK(plexPrice)}</span>
            </div>
          )}
          <div>
            <label className="text-sm text-slate-400 block mb-1">PLEX Quantity</label>
            <input
              type="number"
              value={plexQty}
              onChange={(e) => setPlexQty(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 outline-none"
              required
              min={1}
            />
            {qty > 0 && plexPrice && (
              <div className="text-xs text-slate-400 mt-1">
                Collateral value: {formatISK(collateralValue)}
              </div>
            )}
          </div>

          {/* LTV Indicator */}
          {ltv > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">LTV Ratio</span>
                <span className={ltv > maxLtv ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                  {(ltv * 100).toFixed(1)}% / {(maxLtv * 100).toFixed(0)}% max
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${ltv > maxLtv ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(ltv / maxLtv, 1) * 100}%` }}
                />
              </div>
              {ltv > maxLtv && (
                <div className="text-xs text-red-400">
                  Increase PLEX quantity or reduce loan amount to meet LTV requirements.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Insurance */}
        <div className="eve-card space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={wantsInsurance}
              onChange={(e) => setWantsInsurance(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500"
            />
            <div>
              <div className="font-semibold text-white">Loan Insurance</div>
              <div className="text-sm text-slate-400">
                {defaults
                  ? `2% premium (${formatISK(insurancePremium)}) covers ${(defaults.insuranceCoverage * 100).toFixed(0)}% of principal if you default.`
                  : 'Loading...'}
              </div>
            </div>
          </label>
        </div>

        {/* Summary */}
        {principal > 0 && (
          <div className="eve-card bg-slate-800/30 space-y-2 text-sm">
            <h3 className="font-semibold text-white mb-3">Loan Summary</h3>
            {[
              ['Principal', formatISK(principal)],
              ['Interest (8%)', formatISK(principal * interestRate)],
              wantsInsurance ? ['Insurance Premium (2%)', formatISK(insurancePremium)] : null,
              ['Total Repayment', formatISK(totalRepayment + insurancePremium)],
              ['Term', `${termDays} days`],
              ['Due Date', new Date(Date.now() + termDays * 86400000).toLocaleDateString()],
            ]
              .filter((x): x is string[] => x !== null)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-400">{label}</span>
                  <span className={label === 'Total Repayment' ? 'text-amber-400 font-bold' : 'text-white'}>{value}</span>
                </div>
              ))}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-3 text-sm">{error}</div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={!ltvOk || submitting}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-bold py-3 rounded-lg transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
          <Link
            href="/dashboard"
            className="border border-slate-600 hover:border-slate-400 text-slate-300 px-6 py-3 rounded-lg transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
