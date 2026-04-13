'use client';

import { useState } from 'react';

function formatISK(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

interface Claim {
  loanId: string;
  characterName: string;
  characterId: number;
  principalAmount: number;
  coverageTier: string;
  coveragePercent: number;
  claimAmount: number;
  requestedAt: string;
}

function ClaimCard({ claim, onDone }: { claim: Claim; onDone: () => void }) {
  const [mode, setMode] = useState<'idle' | 'deny'>('idle');
  const [denyReason, setDenyReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleApprove() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/loans/${claim.loanId}/insurance-claim`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to approve');
      } else {
        onDone();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeny() {
    if (!denyReason.trim()) { setError('Denial reason is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/loans/${claim.loanId}/insurance-claim/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: denyReason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to deny');
      } else {
        onDone();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-purple-400 opacity-70">Insurance Claim</div>
          <div className="text-white font-semibold mt-0.5">{claim.characterName}</div>
          <div className="text-sm text-slate-400 mt-0.5">
            {claim.coverageTier} · {(claim.coveragePercent * 100).toFixed(0)}% of {formatISK(claim.principalAmount)}
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-1">{formatISK(claim.claimAmount)}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Filed: {new Date(claim.requestedAt).toLocaleDateString()}
          </div>
        </div>
        <a
          href={`https://evewho.com/character/${claim.characterId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={`https://images.evetech.net/characters/${claim.characterId}/portrait?size=64`}
            alt={claim.characterName}
            className="w-12 h-12 rounded"
          />
        </a>
      </div>

      <div className="text-sm text-slate-400 bg-slate-800/50 rounded px-3 py-2">
        Approve: record the ISK payout in the system (you still need to send it in-game manually).
        Deny: enter a reason — the borrower will see it on their loan page.
      </div>

      {mode === 'deny' && (
        <input
          type="text"
          placeholder="Denial reason (visible to borrower)"
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-400"
        />
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <div className="flex gap-2">
        {mode === 'idle' ? (
          <>
            <button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded text-sm transition-colors"
            >
              {loading ? 'Saving...' : 'Approve Claim'}
            </button>
            <button
              onClick={() => setMode('deny')}
              disabled={loading}
              className="flex-1 border border-red-500/40 hover:border-red-500 text-red-400 hover:text-red-300 px-4 py-2 rounded text-sm transition-colors"
            >
              Deny
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { setMode('idle'); setDenyReason(''); setError(''); }}
              disabled={loading}
              className="flex-1 border border-slate-600 hover:border-slate-400 text-slate-300 px-4 py-2 rounded text-sm transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleDeny}
              disabled={loading}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded text-sm transition-colors"
            >
              {loading ? 'Saving...' : 'Confirm Deny'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function InsuranceClaimQueue({ claims }: { claims: Claim[] }) {
  const [items, setItems] = useState(claims);

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((claim) => (
        <ClaimCard
          key={claim.loanId}
          claim={claim}
          onDone={() => setItems((prev) => prev.filter((c) => c.loanId !== claim.loanId))}
        />
      ))}
    </div>
  );
}
