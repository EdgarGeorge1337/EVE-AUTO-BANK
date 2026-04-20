'use client';

import { useState } from 'react';
import type { AdminAction, ActionType } from '@/app/api/admin/action-queue/route';

function formatISK(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

const ACTION_CONFIG: Record<ActionType, { label: string; color: string; step: string }> = {
  LIQUIDATE_COLLATERAL: {
    label: 'Liquidate Collateral',
    color: 'text-red-400 border-red-500/30 bg-red-500/5',
    step: 'Grace period has expired. Sell the PLEX collateral in-game (Jita market), then click Mark as Done to record the default.',
  },
  PROCESS_INSURANCE_CLAIM: {
    label: 'Insurance Claim',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/5',
    step: 'This loan had insurance. Record the payout below — no in-game action needed, this is an accounting entry.',
  },
  ACCEPT_COLLATERAL_CONTRACT: {
    label: 'Accept PLEX Contract',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    step: 'Open Contracts in-game → find contract from borrower → accept it, then enter the contract ID below.',
  },
  SEND_ISK: {
    label: 'Send ISK',
    color: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
    step: 'Open Wallet in-game → send exact ISK amount to borrower → click Done.',
  },
  RETURN_COLLATERAL: {
    label: 'Return PLEX',
    color: 'text-green-400 border-green-500/30 bg-green-500/5',
    step: 'Create a contract in-game to return PLEX to borrower → enter the contract ID below.',
  },
};

function ActionCard({ action, onDone }: { action: AdminAction; onDone: () => void }) {
  const [contractId, setContractId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cfg = ACTION_CONFIG[action.type];
  const needsContractId = action.type === 'ACCEPT_COLLATERAL_CONTRACT' || action.type === 'RETURN_COLLATERAL';

  async function handleDone() {
    if (needsContractId && !contractId.trim()) {
      setError('Contract ID is required');
      return;
    }
    setLoading(true);
    setError('');

    const endpoint =
      action.type === 'ACCEPT_COLLATERAL_CONTRACT'
        ? `/api/admin/loans/${action.loanId}/mark-collateral-received`
        : action.type === 'SEND_ISK'
        ? `/api/admin/loans/${action.loanId}/mark-isk-sent`
        : action.type === 'LIQUIDATE_COLLATERAL'
        ? `/api/admin/loans/${action.loanId}/liquidate`
        : action.type === 'PROCESS_INSURANCE_CLAIM'
        ? `/api/admin/loans/${action.loanId}/insurance-claim`
        : `/api/admin/loans/${action.loanId}/mark-collateral-returned`;

    const body = needsContractId ? { contractId: contractId.trim() } : {};

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed');
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
    <div className={`rounded-lg border p-4 space-y-3 ${cfg.color}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{cfg.label}</span>
          </div>
          <div className="text-white font-semibold mt-0.5">{action.description}</div>
          {action.type === 'SEND_ISK' && (
            <div className="text-2xl font-bold text-white mt-1">{formatISK(action.amount)}</div>
          )}
          {(action.type === 'ACCEPT_COLLATERAL_CONTRACT' || action.type === 'RETURN_COLLATERAL') && (
            <div className="text-lg font-bold text-white mt-1">
              {action.collateralType === 'MIXED'
                ? `${formatISK(action.amount)} multi-asset`
                : `${action.amount.toLocaleString()} PLEX`}
            </div>
          )}
        </div>
        <a
          href={`https://evewho.com/character/${action.characterId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
        >
          <img
            src={`https://images.evetech.net/characters/${action.characterId}/portrait?size=64`}
            alt={action.characterName}
            className="w-12 h-12 rounded"
          />
        </a>
      </div>

      <div className="text-sm text-slate-400 bg-slate-800/50 rounded px-3 py-2">
        {cfg.step}
      </div>

      {needsContractId && (
        <input
          type="text"
          placeholder="Contract ID (from in-game)"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400"
        />
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        onClick={handleDone}
        disabled={loading}
        className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded text-sm transition-colors"
      >
        {loading ? 'Saving...' : 'Mark as Done'}
      </button>
    </div>
  );
}

export function ActionQueue({ initialActions }: { initialActions: AdminAction[] }) {
  const [actions, setActions] = useState(initialActions);

  function removeAction(loanId: string, type: ActionType) {
    setActions((prev) => prev.filter((a) => !(a.loanId === loanId && a.type === type)));
  }

  if (actions.length === 0) {
    return (
      <div className="eve-card text-center text-slate-400 py-8 text-sm">
        No pending actions — all clear.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <ActionCard
          key={`${action.loanId}-${action.type}`}
          action={action}
          onDone={() => removeAction(action.loanId, action.type)}
        />
      ))}
    </div>
  );
}
