'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
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

type CoverageTier = 'BASIC' | 'STANDARD' | 'PREMIUM';

const TIER_CONFIG: Record<CoverageTier, { coverage: number; basePremiumRate: number; label: string; description: string }> = {
  BASIC:    { coverage: 0.50, basePremiumRate: 0.010, label: 'Basic',    description: '50% of principal covered' },
  STANDARD: { coverage: 0.80, basePremiumRate: 0.020, label: 'Standard', description: '80% of principal covered' },
  PREMIUM:  { coverage: 1.00, basePremiumRate: 0.035, label: 'Premium',  description: '100% of principal covered' },
};

function calcPremium(principal: number, ltv: number, termDays: number, tier: CoverageTier): number {
  if (principal <= 0 || ltv <= 0) return 0;
  const config = TIER_CONFIG[tier];
  const ltvMultiplier  = Math.max(0.60, 1 + (ltv - 0.60) * 2.0);
  const termMultiplier = 0.75 + (termDays / 90) * 0.50;
  return Math.round(principal * config.basePremiumRate * ltvMultiplier * termMultiplier);
}

interface AppraisalItem {
  name: string;
  typeId: number;
  qty: number;
  unitPrice: number;
  totalValue: number;
}

interface AppraisalResult {
  items: AppraisalItem[];
  totalValue: number;
}

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

type CollateralMode = 'plex' | 'multi';

export default function LoanApplyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [defaults, setDefaults] = useState<BankDefaults | null>(null);
  const [plexPrice, setPlexPrice] = useState<number | null>(null);
  const [collateralMode, setCollateralMode] = useState<CollateralMode>('plex');

  // PLEX mode state
  const [principalAmount, setPrincipalAmount] = useState('');
  const [plexQty, setPlexQty] = useState('');

  // Multi-item mode state
  const [itemText, setItemText] = useState('');
  const [appraisal, setAppraisal] = useState<AppraisalResult | null>(null);
  const [appraising, setAppraising] = useState(false);
  const [appraisalError, setAppraisalError] = useState('');
  const [importingAssets, setImportingAssets] = useState(false);
  const [importError, setImportError] = useState('');
  const [needsAssetConnect, setNeedsAssetConnect] = useState(false);

  const [termDays, setTermDays] = useState(30);
  const [coverageTier, setCoverageTier] = useState<CoverageTier | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/public/defaults').then((r) => r.json()).then(setDefaults);
    fetch('/api/public/plex-price').then((r) => r.json()).then((d) => setPlexPrice(d.price));

    // Check query params for asset connect result
    const params = new URLSearchParams(window.location.search);
    if (params.get('assetsConnected')) {
      setCollateralMode('multi');
      window.history.replaceState({}, '', '/loans/apply');
    }
    if (params.get('assetError')) {
      setImportError(`Asset connection failed: ${params.get('assetError')}`);
      window.history.replaceState({}, '', '/loans/apply');
    }
  }, []);

  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=/loans/apply');
    return null;
  }

  const principal = parseFloat(principalAmount) || 0;
  const qty = parseInt(plexQty) || 0;
  const maxLtv = defaults?.maxLtvRatio ?? 0.70;
  const interestRate = defaults?.interestRate ?? 0.08;

  // Collateral value depends on mode
  const collateralValue =
    collateralMode === 'plex'
      ? (plexPrice ? plexPrice * qty : 0)
      : (appraisal?.totalValue ?? 0);

  const ltv = collateralValue > 0 ? principal / collateralValue : 0;
  const totalRepayment = principal * (1 + interestRate);
  const wantsInsurance = coverageTier !== null;
  const insurancePremium = wantsInsurance ? calcPremium(principal, ltv, termDays, coverageTier!) : 0;
  const ltvOk = ltv > 0 && ltv <= maxLtv;

  async function handleImportAssets() {
    setImportingAssets(true);
    setImportError('');
    setNeedsAssetConnect(false);
    try {
      const res = await fetch('/api/user/assets');
      const data = await res.json();
      if (res.status === 403) {
        setNeedsAssetConnect(true);
      } else if (!res.ok) {
        setImportError(data.error ?? 'Failed to fetch assets');
      } else {
        setItemText(data.rawText);
        setAppraisal(null);
      }
    } catch {
      setImportError('Network error fetching assets');
    } finally {
      setImportingAssets(false);
    }
  }

  function handleConnectAssets() {
    signIn('eveonline', { callbackUrl: '/loans/apply?assetsConnected=1' }, { scope: 'publicData esi-assets.read_assets.v1' });
  }

  const handleAppraise = useCallback(async () => {
    const text = itemText.trim();
    if (!text) return;
    setAppraising(true);
    setAppraisalError('');
    setAppraisal(null);

    try {
      const res = await fetch('/api/loans/appraise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppraisalError(data.error ?? 'Appraisal failed');
      } else {
        setAppraisal(data as AppraisalResult);
      }
    } catch {
      setAppraisalError('Network error. Please try again.');
    } finally {
      setAppraising(false);
    }
  }, [itemText]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ltvOk) return;
    setSubmitting(true);
    setError('');

    try {
      let body: Record<string, unknown>;

      if (collateralMode === 'plex') {
        body = { principalAmount: principal, plexQty: qty, termDays, wantsInsurance, coverageTier: coverageTier ?? undefined };
      } else {
        if (!appraisal || appraisal.items.length === 0) {
          setError('Please appraise your items first.');
          setSubmitting(false);
          return;
        }
        body = {
          principalAmount: principal,
          collateralItems: appraisal.items.map((i) => ({ typeName: i.name, qty: i.qty })),
          termDays,
          wantsInsurance,
          coverageTier: coverageTier ?? undefined,
        };
      }

      const res = await fetch('/api/loans/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

        {/* Collateral mode toggle */}
        <div className="eve-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Collateral</h2>
            <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
              <button
                type="button"
                onClick={() => setCollateralMode('plex')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  collateralMode === 'plex'
                    ? 'bg-amber-500 text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                PLEX
              </button>
              <button
                type="button"
                onClick={() => setCollateralMode('multi')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  collateralMode === 'multi'
                    ? 'bg-amber-500 text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Multi-Item
              </button>
            </div>
          </div>

          {collateralMode === 'plex' ? (
            <>
              {plexPrice && (
                <div className="text-sm text-slate-400">
                  Current PLEX price: <span className="text-amber-400 font-semibold">{formatISK(plexPrice)}</span>
                  <span className="text-xs text-slate-500 ml-1">(Janice / Jita 4-4)</span>
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
                  required={collateralMode === 'plex'}
                  min={1}
                />
                {qty > 0 && plexPrice && (
                  <div className="text-xs text-slate-400 mt-1">
                    Collateral value: {formatISK(collateralValue)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">
                  Paste items in format <code className="text-amber-400">500 PLEX</code> — one per line.
                  Priced via <span className="text-slate-300">Janice</span> (Jita 4-4 split price).
                </div>
                <button
                  type="button"
                  onClick={handleImportAssets}
                  disabled={importingAssets}
                  className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                >
                  {importingAssets ? 'Importing...' : '⬇ Import from EVE'}
                </button>
              </div>
              {importError && <div className="text-xs text-red-400">{importError}</div>}
              {needsAssetConnect && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm flex items-center justify-between gap-3">
                  <span className="text-blue-300">Authorize EVE asset access to import your items automatically.</span>
                  <button
                    type="button"
                    onClick={handleConnectAssets}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors"
                  >
                    Connect EVE Assets
                  </button>
                </div>
              )}
              <div>
                <textarea
                  value={itemText}
                  onChange={(e) => { setItemText(e.target.value); setAppraisal(null); }}
                  placeholder={'500 PLEX\n1000000 Tritanium\n50 Compressed Spodumain'}
                  rows={5}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 outline-none font-mono text-sm resize-y"
                />
              </div>
              <button
                type="button"
                onClick={handleAppraise}
                disabled={appraising || !itemText.trim()}
                className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {appraising ? 'Appraising...' : 'Get Appraisal'}
              </button>

              {appraisalError && (
                <div className="text-sm text-red-400">{appraisalError}</div>
              )}

              {appraisal && (
                <div className="space-y-2">
                  <div className="text-sm text-slate-400">
                    {appraisal.items.length} item{appraisal.items.length !== 1 ? 's' : ''} appraised
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-800">
                      {appraisal.items.map((item) => (
                        <tr key={item.typeId} className="text-slate-300">
                          <td className="py-1">{item.name} ×{item.qty.toLocaleString()}</td>
                          <td className="py-1 text-right font-semibold text-white">{formatISK(item.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-600">
                        <td className="pt-2 text-slate-400 font-semibold">Total Collateral</td>
                        <td className="pt-2 text-right font-bold text-amber-400">{formatISK(appraisal.totalValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

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
                  Increase collateral or reduce loan amount to meet LTV requirements.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Insurance */}
        <div className="eve-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Loan Insurance</h2>
              <p className="text-xs text-slate-500 mt-0.5">Optional. Premium is risk-adjusted by LTV, term, and credit score.</p>
            </div>
            {coverageTier && (
              <button
                type="button"
                onClick={() => setCoverageTier(null)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(TIER_CONFIG) as CoverageTier[]).map((tier) => {
              const cfg = TIER_CONFIG[tier];
              const premium = calcPremium(principal, ltv, termDays, tier);
              const selected = coverageTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setCoverageTier(selected ? null : tier)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    selected
                      ? tier === 'BASIC'
                        ? 'border-slate-400 bg-slate-500/20'
                        : tier === 'STANDARD'
                        ? 'border-blue-400 bg-blue-500/20'
                        : 'border-amber-400 bg-amber-500/20'
                      : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'
                  }`}
                >
                  <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${
                    selected
                      ? tier === 'BASIC' ? 'text-slate-300' : tier === 'STANDARD' ? 'text-blue-400' : 'text-amber-400'
                      : 'text-slate-400'
                  }`}>
                    {cfg.label}
                  </div>
                  <div className="text-white font-semibold text-sm">
                    {(cfg.coverage * 100).toFixed(0)}% covered
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {principal > 0 && ltv > 0
                      ? `~${formatISK(premium)} premium`
                      : `~${(cfg.basePremiumRate * 100).toFixed(1)}% base rate`}
                  </div>
                </button>
              );
            })}
          </div>

          {!coverageTier && (
            <p className="text-xs text-slate-500">No insurance selected — click a tier above to add coverage.</p>
          )}
          {coverageTier && (
            <div className="bg-slate-800/50 rounded p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Coverage</span>
                <span className="text-white">{(TIER_CONFIG[coverageTier].coverage * 100).toFixed(0)}% of principal if you default</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Premium (paid upfront)</span>
                <span className="text-amber-400 font-semibold">{formatISK(insurancePremium)}</span>
              </div>
              <p className="text-xs text-slate-500 pt-1">Premium is non-refundable on cancellation. Claim is reviewed by admin before payout.</p>
            </div>
          )}
        </div>

        {/* Summary */}
        {principal > 0 && (
          <div className="eve-card bg-slate-800/30 space-y-2 text-sm">
            <h3 className="font-semibold text-white mb-3">Loan Summary</h3>
            {[
              ['Principal', formatISK(principal)],
              ['Interest (8%)', formatISK(principal * interestRate)],
              wantsInsurance && coverageTier ? [`Insurance — ${TIER_CONFIG[coverageTier].label}`, formatISK(insurancePremium)] : null,
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
            disabled={!ltvOk || submitting || (collateralMode === 'multi' && !appraisal)}
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
