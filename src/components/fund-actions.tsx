'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${Math.round(n).toLocaleString()} ISK`;
}

interface Tx {
  id: string;
  type: string;
  iskAmount: number;
  units: number | null;
  status: string;
  createdAt: string;
}

export function FundActions({
  bankCharacterName,
  positionUnits,
  navPerUnit,
  transactions,
}: {
  bankCharacterName: string;
  positionUnits: number;
  navPerUnit: number;
  transactions: Tx[];
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [iskAmount, setIskAmount] = useState('');
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(path: string, body: object, onOk: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Request failed');
      else { setNotice(onOk); router.refresh(); }
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-slate-300 mb-4">Sign in to invest in the fund.</p>
        <button
          onClick={() => signIn('eveonline')}
          className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded text-sm"
        >
          Sign In with EVE Online
        </button>
      </div>
    );
  }

  const pending = transactions.filter((t) => t.status === 'OPEN');

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Invest</h3>
          <p className="text-xs text-slate-500 mb-4">
            Units are issued at the NAV per unit on the day your ISK arrives.
          </p>
          <div className="flex gap-3">
            <input
              value={iskAmount}
              onChange={(e) => setIskAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="ISK amount (min 100M)"
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white flex-1"
            />
            <button
              onClick={() => submit('/api/fund/subscribe', { iskAmount: parseInt(iskAmount, 10) || 0 },
                `Subscription requested — send the ISK to ${bankCharacterName} in-game.`)}
              disabled={busy || !iskAmount}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
            >
              Subscribe
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Redeem</h3>
          <p className="text-xs text-slate-500 mb-4">
            You hold <span className="text-white">{positionUnits.toFixed(4)}</span> units
            (~{formatISK(positionUnits * navPerUnit)} at current NAV).
          </p>
          <div className="flex gap-3">
            <input
              value={units}
              onChange={(e) => setUnits(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Units to redeem"
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white flex-1"
            />
            <button
              onClick={() => submit('/api/fund/redeem', { units: parseFloat(units) || 0 },
                'Redemption requested — the bank pays out at the NAV on processing day.')}
              disabled={busy || !units || positionUnits <= 0}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
            >
              Redeem
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {notice && <p className="text-green-400 text-sm">{notice}</p>}

      {transactions.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">My Fund Transactions</h3>
          <div className="space-y-2 text-sm">
            {transactions.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between border border-slate-800 rounded p-3 gap-2">
                <div>
                  <span className={t.type === 'SUBSCRIBE' ? 'text-green-400' : 'text-red-400'}>{t.type}</span>{' '}
                  {t.type === 'SUBSCRIBE'
                    ? <span className="text-white">{formatISK(t.iskAmount)}</span>
                    : <span className="text-white">{(t.units ?? 0).toFixed(4)} units{t.iskAmount > 0 ? ` → ${formatISK(t.iskAmount)}` : ''}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={t.status === 'COMPLETED' ? 'text-green-400' : t.status === 'OPEN' ? 'text-amber-400' : 'text-slate-400'}>
                    {t.status}
                  </span>
                  {t.status === 'OPEN' && (
                    <button
                      onClick={() => submit(`/api/fund/tx/${t.id}/cancel`, {}, 'Cancelled.')}
                      disabled={busy}
                      className="text-slate-400 hover:text-red-400 text-xs"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {pending.some((t) => t.type === 'SUBSCRIBE') && (
            <p className="text-xs text-amber-300/80 mt-3">
              For pending subscriptions: send the exact ISK to <b>{bankCharacterName}</b> in-game with reason <b>FUND-&lt;first 8 chars of the transaction&gt;</b>. Units are issued once it clears.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
