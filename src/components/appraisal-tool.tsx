'use client';

import { useState } from 'react';

interface AppraisalItem {
  name: string;
  typeId: number;
  qty: number;
  unitPrice: number;
  totalValue: number;
  buyMax: number;
  sellMin: number;
}

interface AppraisalResult {
  items: AppraisalItem[];
  totalValue: number;
  fetchedAt: string;
}

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

interface AppraisalToolProps {
  /** API endpoint to POST to */
  endpoint: string;
}

export function AppraisalTool({ endpoint }: AppraisalToolProps) {
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<AppraisalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAppraise() {
    const text = rawText.trim();
    if (!text) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Appraisal failed');
      } else {
        setResult(data as AppraisalResult);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-slate-400 block mb-1">
          Paste items — one per line in format: <code className="text-amber-400">500 PLEX</code>
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={'500 PLEX\n1000000 Tritanium\n50 Compressed Spodumain'}
          rows={6}
          className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 outline-none font-mono text-sm resize-y"
        />
      </div>

      <button
        onClick={handleAppraise}
        disabled={loading || !rawText.trim()}
        className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-semibold px-5 py-2 rounded transition-colors text-sm"
      >
        {loading ? 'Appraising...' : 'Appraise via Janice'}
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-3 text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">
              {result.items.length} item{result.items.length !== 1 ? 's' : ''} appraised
              {' · '}
              <span className="text-slate-500 text-xs">
                {new Date(result.fetchedAt).toLocaleTimeString()}
              </span>
            </span>
            <span className="text-xl font-bold text-amber-400">{formatISK(result.totalValue)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  <th className="pb-2 font-normal">Item</th>
                  <th className="pb-2 font-normal text-right">Qty</th>
                  <th className="pb-2 font-normal text-right">Split Price</th>
                  <th className="pb-2 font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {result.items.map((item) => (
                  <tr key={item.typeId} className="text-slate-300">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-right text-slate-400">{item.qty.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-400">{formatISK(item.unitPrice)}</td>
                    <td className="py-2 text-right font-semibold text-white">{formatISK(item.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600">
                  <td colSpan={3} className="pt-2 text-slate-400 font-semibold">Total</td>
                  <td className="pt-2 text-right font-bold text-amber-400">{formatISK(result.totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-xs text-slate-500">
            Prices via <a href="https://janice.e-351.com" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white underline">Janice</a> — Jita 4-4 split price
          </div>
        </div>
      )}
    </div>
  );
}
