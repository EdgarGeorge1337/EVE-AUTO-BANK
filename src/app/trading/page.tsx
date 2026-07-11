import { TradingDesk } from '@/components/trading-desk';
import { getMarketInsights, type MarketInsight } from '@/lib/insights';
import { getSectorReports } from '@/lib/mer';

export const dynamic = 'force-dynamic';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return Math.round(n).toLocaleString();
}

function pct(n: number | null) {
  if (n === null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)}%`;
}

const SIGNAL_STYLES: Record<string, string> = {
  BUY: 'text-green-400 bg-green-500/10 border-green-500/30',
  SELL: 'text-red-400 bg-red-500/10 border-red-500/30',
  HOLD: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

export default async function TradingPage() {
  let insights: MarketInsight[] = [];
  let insightsError = '';
  try {
    insights = await getMarketInsights();
  } catch (err) {
    insightsError = String(err instanceof Error ? err.message : err);
  }
  const sectors = await getSectorReports();
  const bankCharacterName = process.env.ADMIN_CHARACTER_NAME ?? 'the bank character';

  return (
    <div className="container mx-auto px-4 max-w-7xl py-8 space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white">Trading Desk</h1>
        <p className="text-slate-400 mt-1">
          Trade with the bank at Jita pricing, follow market signals, and read the monthly sector reports.
        </p>
      </div>

      <TradingDesk bankCharacterName={bankCharacterName} />

      <section>
        <h2 className="text-xl font-semibold text-white mb-1">Market Insights</h2>
        <p className="text-sm text-slate-500 mb-4">
          Live Jita pricing vs recent history. Signals are advisory momentum indicators, not financial advice — in New Eden or anywhere else.
        </p>
        {insightsError ? (
          <p className="text-slate-500 text-sm border border-slate-800 rounded p-4">
            Market data unavailable right now ({insightsError}).
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">24h</th>
                  <th className="px-4 py-2 text-right">7d</th>
                  <th className="px-4 py-2 text-right">Bid/Ask Spread</th>
                  <th className="px-4 py-2">Signal</th>
                </tr>
              </thead>
              <tbody>
                {insights.map((i) => (
                  <tr key={i.typeId} className="border-t border-slate-800">
                    <td className="px-4 py-2 text-white">{i.typeName}</td>
                    <td className="px-4 py-2 text-right text-white">{formatISK(i.price)}</td>
                    <td className={`px-4 py-2 text-right ${(i.change24hPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pct(i.change24hPct)}</td>
                    <td className={`px-4 py-2 text-right ${(i.change7dPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pct(i.change7dPct)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{(i.spreadPct * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block border rounded px-2 py-0.5 text-xs font-medium ${SIGNAL_STYLES[i.signal]}`} title={i.signalReason}>
                        {i.signal}
                      </span>
                      <span className="text-xs text-slate-500 ml-2 hidden lg:inline">{i.signalReason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-1">
          Sector Reports{sectors.month ? <span className="text-slate-400 font-normal"> — {sectors.month}</span> : ''}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Regional economy figures from CCP&apos;s published Monthly Economic Report. Where the ISK is being made — and destroyed.
        </p>
        {sectors.sectors.length === 0 ? (
          <p className="text-slate-500 text-sm border border-slate-800 rounded p-4">
            Sector data not imported yet — it loads automatically within a day of deployment.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-2">Region</th>
                  <th className="px-4 py-2 text-right">Trade</th>
                  <th className="px-4 py-2 text-right">Production</th>
                  <th className="px-4 py-2 text-right">Mining</th>
                  <th className="px-4 py-2 text-right">Bounties</th>
                  <th className="px-4 py-2 text-right">Destroyed</th>
                  <th className="px-4 py-2 text-right">Total Activity</th>
                  <th className="px-4 py-2 text-right">MoM</th>
                </tr>
              </thead>
              <tbody>
                {sectors.sectors.slice(0, 20).map((s) => (
                  <tr key={s.region} className="border-t border-slate-800">
                    <td className="px-4 py-2 text-white">{s.region}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatISK(s.tradeValue)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatISK(s.producedValue)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatISK(s.minedValue)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatISK(s.npcBounties)}</td>
                    <td className="px-4 py-2 text-right text-orange-300">{formatISK(s.destroyedValue)}</td>
                    <td className="px-4 py-2 text-right text-white font-medium">{formatISK(s.totalActivity)}</td>
                    <td className={`px-4 py-2 text-right ${(s.momGrowthPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pct(s.momGrowthPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
