import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { getActiveFund, getFundDashboard } from '@/lib/fund';
import { FundActions } from '@/components/fund-actions';

export const dynamic = 'force-dynamic';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${Math.round(n).toLocaleString()} ISK`;
}

function pct(n: number | null) {
  if (n === null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export default async function FundPage() {
  const fund = await getActiveFund();

  if (!fund) {
    return (
      <div className="container mx-auto px-4 max-w-4xl py-16 text-center">
        <h1 className="text-3xl font-bold text-white mb-4">Index Fund</h1>
        <p className="text-slate-400">The bank&apos;s index fund has not launched yet. Check back soon.</p>
      </div>
    );
  }

  const dashboard = await getFundDashboard(fund.id);
  const { nav } = dashboard;

  const session = await getServerSession(authOptions);
  let positionUnits = 0;
  let transactions: { id: string; type: string; iskAmount: number; units: number | null; status: string; createdAt: string }[] = [];
  if (session?.user?.id) {
    const character = await db.character.findUnique({ where: { userId: session.user.id } });
    if (character) {
      const position = await db.fundPosition.findUnique({
        where: { fundId_characterId: { fundId: fund.id, characterId: character.id } },
      });
      positionUnits = position?.units ?? 0;
      const txs = await db.fundTransaction.findMany({
        where: { fundId: fund.id, characterId: character.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      transactions = txs.map((t) => ({
        id: t.id, type: t.type, iskAmount: t.iskAmount, units: t.units, status: t.status,
        createdAt: t.createdAt.toISOString(),
      }));
    }
  }

  return (
    <div className="container mx-auto px-4 max-w-7xl py-8 space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white">{fund.name}</h1>
        <p className="text-slate-400 mt-1">{fund.description}</p>
      </div>

      {/* Fund Value Breakdown + Insights — layout after Oz's community fund tracker */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Fund Value Breakdown</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Cash Balance</dt><dd className="text-white">{formatISK(nav.cashBalance)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Inventory Value</dt><dd className="text-white">{formatISK(nav.holdingsValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Future Sales Tax</dt><dd className="text-orange-300">−{formatISK(nav.futureSalesTax)}</dd></div>
            <div className="flex justify-between border-t border-slate-800 pt-2 font-semibold"><dt className="text-slate-300">Net Asset Value</dt><dd className="text-amber-400">{formatISK(nav.nav)}</dd></div>
          </dl>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Fund Insights</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Days running</dt><dd className="text-white">{dashboard.daysRunning}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">NAV / unit</dt><dd className="text-white">{formatISK(nav.navPerUnit)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Since inception</dt><dd className={dashboard.changeSinceInceptionPct >= 0 ? 'text-green-400' : 'text-red-400'}>{pct(dashboard.changeSinceInceptionPct)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">7-day return</dt><dd className={(dashboard.weeklyReturnPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>{pct(dashboard.weeklyReturnPct)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">30-day return</dt><dd className={(dashboard.monthlyReturnPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>{pct(dashboard.monthlyReturnPct)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Units outstanding</dt><dd className="text-white">{nav.unitsOutstanding.toFixed(2)}</dd></div>
          </dl>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">This Week</h3>
          <div className="text-sm space-y-3">
            <div>
              <div className="text-slate-400 text-xs mb-1">Largest position</div>
              <div className="text-white">
                {dashboard.largestPosition ? `${dashboard.largestPosition.typeName} (${formatISK(dashboard.largestPosition.value)})` : 'None yet'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-xs mb-1">Winners</div>
              {dashboard.winners.length === 0 ? <div className="text-slate-500">—</div> :
                dashboard.winners.map((w) => (
                  <div key={w.typeName} className="flex justify-between"><span className="text-white">{w.typeName}</span><span className="text-green-400">{pct(w.changePct)}</span></div>
                ))}
            </div>
            <div>
              <div className="text-slate-400 text-xs mb-1">Losers</div>
              {dashboard.losers.length === 0 ? <div className="text-slate-500">—</div> :
                dashboard.losers.map((l) => (
                  <div key={l.typeName} className="flex justify-between"><span className="text-white">{l.typeName}</span><span className="text-red-400">{pct(l.changePct)}</span></div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {nav.holdings.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-white mb-4">Portfolio</h2>
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Avg Cost</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-right">Weight</th>
                  <th className="px-4 py-2 text-right">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {nav.holdings.map((h) => (
                  <tr key={h.typeId} className="border-t border-slate-800">
                    <td className="px-4 py-2 text-white">{h.typeName}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{h.qty.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatISK(h.unitPrice)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatISK(h.avgCost)}</td>
                    <td className="px-4 py-2 text-right text-white">{formatISK(h.value)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{(h.weightPct * 100).toFixed(1)}%</td>
                    <td className={`px-4 py-2 text-right ${h.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatISK(h.unrealizedPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Participate</h2>
        <FundActions
          bankCharacterName={process.env.ADMIN_CHARACTER_NAME ?? 'the bank character'}
          positionUnits={positionUnits}
          navPerUnit={nav.navPerUnit}
          transactions={transactions}
        />
        <p className="text-xs text-slate-600 mt-4">
          Entry fee {(fund.entryFeePct * 100).toFixed(1)}% (accrues to the fund, not the bank). NAV is quoted net of estimated
          liquidation costs (sales tax + broker fee). This is a game — but the risks work like the real thing: NAV can go down.
        </p>
      </section>
    </div>
  );
}
