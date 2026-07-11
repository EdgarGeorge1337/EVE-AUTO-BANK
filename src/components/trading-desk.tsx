'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${Math.round(n).toLocaleString()} ISK`;
}

interface Quote {
  typeName: string;
  qty: number;
  side: 'BUY' | 'SELL';
  marketPrice: number;
  unitPrice: number;
  totalValue: number;
  spreadPct: number;
}

interface Order {
  id: string;
  side: 'BUY' | 'SELL';
  typeName: string;
  qty: number;
  unitPrice: number;
  totalValue: number;
  status: string;
  createdAt: string;
  expiresAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-amber-400',
  RECEIVED: 'text-blue-400',
  COMPLETED: 'text-green-400',
  CANCELLED: 'text-slate-400',
  EXPIRED: 'text-slate-500',
};

export function TradingDesk({ bankCharacterName }: { bankCharacterName: string }) {
  const { data: session } = useSession();
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [typeName, setTypeName] = useState('PLEX');
  const [qty, setQty] = useState('100');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOrders = useCallback(async () => {
    if (!session) return;
    const res = await fetch('/api/trading/orders');
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders ?? []);
    }
  }, [session]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function getQuote() {
    setBusy(true); setError(''); setQuote(null); setNotice('');
    try {
      const res = await fetch('/api/trading/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeName, qty: parseInt(qty, 10) || 0, side }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Quote failed');
      else setQuote(data);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    if (!quote) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeName: quote.typeName, qty: quote.qty, side: quote.side }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Order failed');
      else {
        setQuote(null);
        setNotice('Order placed — see the instructions on it below.');
        await loadOrders();
      }
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(id: string) {
    setBusy(true);
    await fetch(`/api/trading/orders/${id}/cancel`, { method: 'POST' });
    await loadOrders();
    setBusy(false);
  }

  if (!session) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-slate-300 mb-4">Sign in to trade with the bank.</p>
        <button
          onClick={() => signIn('eveonline')}
          className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded text-sm"
        >
          Sign In with EVE Online
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Place an Order</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Direction</label>
            <div className="flex rounded overflow-hidden border border-slate-700">
              {(['BUY', 'SELL'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setSide(s); setQuote(null); }}
                  className={`px-4 py-2 text-sm font-medium ${side === s
                    ? s === 'BUY' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    : 'bg-slate-800 text-slate-400'}`}
                >
                  {s === 'BUY' ? 'Buy from bank' : 'Sell to bank'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Item</label>
            <input
              value={typeName}
              onChange={(e) => { setTypeName(e.target.value); setQuote(null); }}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white w-56"
              placeholder="PLEX"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Quantity</label>
            <input
              value={qty}
              onChange={(e) => { setQty(e.target.value.replace(/[^\d]/g, '')); setQuote(null); }}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white w-28"
            />
          </div>
          <button
            onClick={getQuote}
            disabled={busy || !typeName || !qty}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Get Quote
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        {notice && <p className="text-green-400 text-sm mt-3">{notice}</p>}

        {quote && (
          <div className="mt-4 border border-slate-700 rounded p-4 bg-slate-800/50">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-slate-400 text-xs">Jita split</div>
                <div className="text-white">{formatISK(quote.marketPrice)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Your price ({(quote.spreadPct * 100).toFixed(1)}% spread)</div>
                <div className="text-amber-400 font-semibold">{formatISK(quote.unitPrice)} / unit</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Total</div>
                <div className="text-white font-semibold">{formatISK(quote.totalValue)}</div>
              </div>
            </div>
            <button
              onClick={placeOrder}
              disabled={busy}
              className="mt-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2 rounded text-sm"
            >
              {quote.side === 'BUY' ? `Buy ${quote.qty}x ${quote.typeName}` : `Sell ${quote.qty}x ${quote.typeName}`}
            </button>
            <p className="text-xs text-slate-500 mt-2">Quotes refresh with the market; the final price locks when you place the order.</p>
          </div>
        )}
      </div>

      {orders.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">My Orders</h3>
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="border border-slate-800 rounded p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className={o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>{o.side}</span>{' '}
                    <span className="text-white">{o.qty}x {o.typeName}</span>{' '}
                    <span className="text-slate-400">@ {formatISK(o.unitPrice)}</span>{' '}
                    <span className="text-white font-medium">= {formatISK(o.totalValue)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={STATUS_COLORS[o.status] ?? 'text-slate-400'}>{o.status}</span>
                    {o.status === 'OPEN' && (
                      <button onClick={() => cancelOrder(o.id)} disabled={busy} className="text-slate-400 hover:text-red-400 text-xs">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                {o.status === 'OPEN' && (
                  <p className="text-xs text-amber-300/80 mt-2">
                    {o.side === 'BUY'
                      ? <>Send <b>{formatISK(o.totalValue)}</b> to <b>{bankCharacterName}</b> in-game with reason <b>TRADE-{o.id.slice(-8)}</b>. The bank contracts your items after payment clears.</>
                      : <>Create an item-exchange contract to <b>{bankCharacterName}</b> for <b>{o.qty}x {o.typeName}</b> asking <b>{formatISK(o.totalValue)}</b>, description <b>TRADE-{o.id.slice(-8)}</b>.</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
