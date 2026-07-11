'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${Math.round(n).toLocaleString()} ISK`;
}

export interface AdminTradeOrder {
  id: string;
  side: string;
  typeName: string;
  qty: number;
  totalValue: number;
  status: string;
  characterName: string;
}

export interface AdminFundTx {
  id: string;
  type: string;
  iskAmount: number;
  units: number | null;
  status: string;
  characterName: string;
}

export function InvestmentAdmin({
  hasFund,
  fundCash,
  tradeOrders,
  fundTxs,
}: {
  hasFund: boolean;
  fundCash: number;
  tradeOrders: AdminTradeOrder[];
  fundTxs: AdminFundTx[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [trade, setTrade] = useState({ side: 'BUY', typeName: '', qty: '', totalIsk: '' });

  async function post(path: string, body?: object) {
    setBusy(true); setMsg('');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      setMsg(res.ok ? 'Done.' : (data.error ?? 'Failed'));
      if (res.ok) router.refresh();
    } catch {
      setMsg('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && <p className={`text-sm ${msg === 'Done.' ? 'text-green-400' : 'text-red-400'}`}>{msg}</p>}

      {/* Trade desk queue */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Trade Desk Queue</h3>
        {tradeOrders.length === 0 ? (
          <p className="text-slate-500 text-sm">No open trade orders.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {tradeOrders.map((o) => (
              <div key={o.id} className="border border-slate-800 rounded p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-white font-medium">{o.characterName}</span>{' '}
                    <span className={o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>{o.side}</span>{' '}
                    <span className="text-white">{o.qty}x {o.typeName}</span>{' '}
                    <span className="text-slate-400">({formatISK(o.totalValue)})</span>{' '}
                    <span className="text-xs text-slate-500">TRADE-{o.id.slice(-8)}</span>
                  </div>
                  <div className="flex gap-2">
                    {o.status === 'OPEN' && (
                      <button onClick={() => post(`/api/admin/trading/${o.id}`, { action: 'mark-received' })} disabled={busy}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs">
                        {o.side === 'BUY' ? 'ISK received' : 'Contract accepted'}
                      </button>
                    )}
                    {o.status === 'RECEIVED' && (
                      <button onClick={() => post(`/api/admin/trading/${o.id}`, { action: 'mark-fulfilled' })} disabled={busy}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs">
                        {o.side === 'BUY' ? 'Items contracted' : 'ISK sent'} — complete
                      </button>
                    )}
                    {o.status === 'OPEN' && (
                      <button onClick={() => post(`/api/admin/trading/${o.id}`, { action: 'cancel' })} disabled={busy}
                        className="text-slate-400 hover:text-red-400 text-xs px-2">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {o.status === 'OPEN'
                    ? o.side === 'BUY'
                      ? 'Waiting on the player’s ISK. Confirm it in the wallet journal, then mark received.'
                      : 'Waiting on the player’s item contract. Accept it in-game, then mark received.'
                    : o.side === 'BUY'
                      ? 'Create the item contract to the player, then complete.'
                      : 'Send the ISK to the player, then complete.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fund admin */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Index Fund</h3>

        {!hasFund ? (
          <button
            onClick={() => post('/api/admin/fund', {
              action: 'create',
              name: 'New Eden Index Fund',
              description: 'A diversified basket of liquid EVE commodities (PLEX, injectors, minerals) managed by the bank. Subscribe with ISK, receive units at NAV.',
            })}
            disabled={busy}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded text-sm"
          >
            Launch New Eden Index Fund
          </button>
        ) : (
          <>
            <p className="text-sm text-slate-400 mb-4">Fund cash: <span className="text-white">{formatISK(fundCash)}</span></p>

            {fundTxs.length > 0 && (
              <div className="space-y-3 text-sm mb-6">
                <h4 className="text-sm font-semibold text-slate-300">Pending Transactions</h4>
                {fundTxs.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between border border-slate-800 rounded p-3 gap-2">
                    <div>
                      <span className="text-white font-medium">{t.characterName}</span>{' '}
                      <span className={t.type === 'SUBSCRIBE' ? 'text-green-400' : 'text-red-400'}>{t.type}</span>{' '}
                      {t.type === 'SUBSCRIBE'
                        ? <span className="text-white">{formatISK(t.iskAmount)}</span>
                        : <span className="text-white">{(t.units ?? 0).toFixed(4)} units</span>}{' '}
                      <span className="text-xs text-slate-500">FUND-{t.id.slice(0, 8)}</span>
                    </div>
                    <button onClick={() => post(`/api/admin/fund/tx/${t.id}/process`)} disabled={busy}
                      className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs">
                      {t.type === 'SUBSCRIBE' ? 'ISK received — issue units' : 'Process & send ISK'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h4 className="text-sm font-semibold text-slate-300 mb-2">Record Basket Trade</h4>
            <p className="text-xs text-slate-500 mb-3">
              After buying/selling fund assets in-game with the bank character, record it here so NAV stays true.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={trade.side} onChange={(e) => setTrade({ ...trade, side: e.target.value })}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-white">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
              <input placeholder="Item name" value={trade.typeName}
                onChange={(e) => setTrade({ ...trade, typeName: e.target.value })}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white w-48" />
              <input placeholder="Qty" value={trade.qty}
                onChange={(e) => setTrade({ ...trade, qty: e.target.value.replace(/[^\d]/g, '') })}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white w-24" />
              <input placeholder="Total ISK" value={trade.totalIsk}
                onChange={(e) => setTrade({ ...trade, totalIsk: e.target.value.replace(/[^\d]/g, '') })}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white w-36" />
              <button
                onClick={() => post('/api/admin/fund', {
                  action: 'trade',
                  side: trade.side,
                  typeName: trade.typeName,
                  qty: parseInt(trade.qty, 10) || 0,
                  totalIsk: parseInt(trade.totalIsk, 10) || 0,
                })}
                disabled={busy || !trade.typeName || !trade.qty || !trade.totalIsk}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm">
                Record
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Sector Reports (MER)</h3>
        <p className="text-xs text-slate-500 mb-3">Re-imports the latest CCP Monthly Economic Report months (~65 MB download).</p>
        <button onClick={() => post('/api/admin/sectors/refresh')} disabled={busy}
          className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">
          Refresh MER data now
        </button>
      </div>
    </div>
  );
}
