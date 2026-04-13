import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';
import Link from 'next/link';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-green-400',
  OVERDUE: 'text-orange-400',
  COMPLETED: 'text-lime-400',
  DEFAULTED: 'text-red-400',
  PENDING: 'text-amber-400',
  APPROVED: 'text-blue-400',
  CANCELLED: 'text-slate-400',
};

const STATUS_BAR: Record<string, string> = {
  ACTIVE: 'bg-green-500',
  OVERDUE: 'bg-orange-500',
  COMPLETED: 'bg-lime-500',
  DEFAULTED: 'bg-red-500',
};

export const revalidate = 300; // 5-min cache

export default async function TransparencyPage() {
  const [allLoans, recentLoans, plexResult] = await Promise.all([
    db.loan.findMany({
      select: {
        status: true,
        principalAmount: true,
        ltvRatio: true,
        termDays: true,
        collateralPlexQty: true,
        createdAt: true,
        completedAt: true,
        hasInsurance: true,
      },
    }),
    db.loan.findMany({
      where: { status: { in: ['ACTIVE', 'OVERDUE', 'COMPLETED', 'DEFAULTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        principalAmount: true,
        status: true,
        ltvRatio: true,
        termDays: true,
        collateralPlexQty: true,
        createdAt: true,
        hasInsurance: true,
        character: { select: { characterName: true, characterId: true } },
      },
    }),
    appraiseItems([{ typeName: 'PLEX', qty: 1 }]).catch(() => null),
  ]);

  const plexPrice = plexResult?.items[0]?.unitPrice ?? null;

  // Compute stats
  const total = allLoans.length;
  const byStatus = allLoans.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  const active = byStatus['ACTIVE'] ?? 0;
  const overdue = byStatus['OVERDUE'] ?? 0;
  const completed = byStatus['COMPLETED'] ?? 0;
  const defaulted = byStatus['DEFAULTED'] ?? 0;
  const insuredCount = allLoans.filter((l) => l.hasInsurance).length;

  const totalVolume = allLoans.reduce((s, l) => s + l.principalAmount, 0);
  const activeVolume = allLoans
    .filter((l) => ['ACTIVE', 'OVERDUE'].includes(l.status))
    .reduce((s, l) => s + l.principalAmount, 0);

  const activePlex = allLoans
    .filter((l) => ['ACTIVE', 'OVERDUE'].includes(l.status))
    .reduce((s, l) => s + l.collateralPlexQty, 0);
  const liveCollateralValue = plexPrice ? activePlex * plexPrice : null;

  const avgLtv =
    allLoans.length > 0
      ? allLoans.reduce((s, l) => s + l.ltvRatio, 0) / allLoans.length
      : 0;
  const avgSize =
    allLoans.length > 0 ? totalVolume / allLoans.length : 0;

  const defaultRate = total > 0 ? (defaulted / total) * 100 : 0;
  const repayRate = (completed + defaulted) > 0
    ? (completed / (completed + defaulted)) * 100
    : 0;

  // Portfolio bar widths
  const barLoans = allLoans.filter((l) =>
    ['ACTIVE', 'OVERDUE', 'COMPLETED', 'DEFAULTED'].includes(l.status)
  );
  const barTotal = barLoans.length || 1;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white">Transparency Report</h1>
        <p className="text-slate-400 mt-2">
          Live bank statistics, portfolio health, and loan activity. Updated every 5 minutes.
        </p>
      </div>

      {/* PLEX Price Banner */}
      {plexPrice && (
        <div className="eve-card flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wide">Live PLEX Price — Jita 4-4</div>
            <div className="text-3xl font-bold text-amber-400 mt-1">{formatISK(plexPrice)}</div>
          </div>
          {liveCollateralValue && (
            <div className="text-right">
              <div className="text-slate-400 text-xs uppercase tracking-wide">Total Collateral Held</div>
              <div className="text-xl font-bold text-white mt-1">{formatISK(liveCollateralValue)}</div>
              <div className="text-slate-500 text-xs">{activePlex.toLocaleString()} PLEX</div>
            </div>
          )}
        </div>
      )}

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Loans', value: total.toLocaleString() },
          { label: 'Active + Overdue', value: (active + overdue).toLocaleString() },
          { label: 'Volume Processed', value: formatISK(totalVolume) },
          { label: 'Repayment Rate', value: `${repayRate.toFixed(1)}%` },
        ].map((s) => (
          <div key={s.label} className="eve-card text-center">
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {[
          { label: 'Avg Loan Size', value: formatISK(avgSize) },
          { label: 'Avg LTV', value: `${(avgLtv * 100).toFixed(1)}%` },
          { label: 'Default Rate', value: `${defaultRate.toFixed(1)}%` },
          { label: 'Insured Loans', value: `${insuredCount} / ${total}` },
        ].map((s) => (
          <div key={s.label} className="eve-card text-center">
            <div className="text-xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Portfolio Breakdown Bar */}
      {barLoans.length > 0 && (
        <div className="eve-card space-y-4">
          <h2 className="font-semibold text-white">Portfolio Breakdown</h2>
          <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
            {(['ACTIVE', 'OVERDUE', 'COMPLETED', 'DEFAULTED'] as const).map((s) => {
              const count = byStatus[s] ?? 0;
              const pct = (count / barTotal) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={s}
                  className={`${STATUS_BAR[s]} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${s}: ${count}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['ACTIVE', 'OVERDUE', 'COMPLETED', 'DEFAULTED'] as const).map((s) => {
              const count = byStatus[s] ?? 0;
              if (count === 0) return null;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm ${STATUS_BAR[s]}`} />
                  <span className="text-slate-400">{s}</span>
                  <span className="text-white font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
          {activeVolume > 0 && (
            <div className="text-sm text-slate-400">
              Active book: <span className="text-white font-semibold">{formatISK(activeVolume)}</span> across {active + overdue} loans
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="py-3 pr-4">Character</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Collateral</th>
                <th className="py-3 pr-4">LTV</th>
                <th className="py-3 pr-4">Term</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentLoans.map((loan) => (
                <tr key={loan.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <img
                        src={`https://images.evetech.net/characters/${loan.character.characterId}/portrait?size=32`}
                        alt=""
                        className="w-6 h-6 rounded"
                      />
                      <span className="text-white">{loan.character.characterName}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-white font-semibold">{formatISK(loan.principalAmount)}</td>
                  <td className="py-3 pr-4 text-slate-300">{loan.collateralPlexQty.toLocaleString()} PLEX</td>
                  <td className="py-3 pr-4 text-slate-300">{(loan.ltvRatio * 100).toFixed(1)}%</td>
                  <td className="py-3 pr-4 text-slate-300">{loan.termDays}d</td>
                  <td className={`py-3 pr-4 font-semibold ${STATUS_COLORS[loan.status] ?? 'text-slate-300'}`}>
                    {loan.status}
                    {loan.hasInsurance && <span className="text-xs text-amber-500 ml-1">⚑</span>}
                  </td>
                  <td className="py-3 text-slate-500">{new Date(loan.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentLoans.length === 0 && (
            <div className="text-center py-16 text-slate-400">No loan data yet.</div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="text-xs text-slate-600 text-center pb-4">
        PLEX prices sourced from <a href="https://janice.e-351.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 underline">Janice</a> (Jita 4-4 split price).
        Loan data refreshes every 5 minutes.{' '}
        <Link href="/api/public/transparency" className="hover:text-slate-400 underline">JSON API</Link>
      </div>
    </div>
  );
}
