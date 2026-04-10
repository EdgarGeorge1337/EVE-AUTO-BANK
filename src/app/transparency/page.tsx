import { db } from '@/lib/db';
import { getBankStats } from '@/lib/loans';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-green-400',
  COMPLETED: 'text-lime-400',
  DEFAULTED: 'text-red-400',
};

export const revalidate = 300; // 5-min cache

export default async function TransparencyPage() {
  const [stats, recentLoans] = await Promise.all([
    getBankStats(),
    db.loan.findMany({
      where: { status: { in: ['ACTIVE', 'COMPLETED', 'DEFAULTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        principalAmount: true,
        status: true,
        ltvRatio: true,
        termDays: true,
        createdAt: true,
        character: { select: { characterName: true, characterId: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Transparency Report</h1>
        <p className="text-slate-400 mt-2">Real-time bank statistics and recent loan activity.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Loans', value: stats.totalLoans.toLocaleString() },
          { label: 'Active Loans', value: stats.activeLoans.toLocaleString() },
          { label: 'Volume Processed', value: formatISK(stats.totalVolume) },
          { label: 'Default Rate', value: `${stats.defaultRate.toFixed(1)}%` },
        ].map((s) => (
          <div key={s.label} className="eve-card text-center">
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {stats.plexPrice && (
        <div className="eve-card flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-sm">Current PLEX Price (Jita)</div>
            <div className="text-2xl font-bold text-amber-400">{formatISK(stats.plexPrice)}</div>
          </div>
          <div className="text-xs text-slate-500">
            Updated: {stats.plexPriceUpdatedAt ? new Date(stats.plexPriceUpdatedAt).toLocaleString() : 'N/A'}
          </div>
        </div>
      )}

      {/* Recent Loans */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="py-3 pr-4">Character</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">LTV</th>
                <th className="py-3 pr-4">Term</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentLoans.map((loan) => (
                <tr key={loan.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-4 text-white">{loan.character.characterName}</td>
                  <td className="py-3 pr-4 text-white">{formatISK(loan.principalAmount)}</td>
                  <td className="py-3 pr-4 text-slate-300">{(loan.ltvRatio * 100).toFixed(1)}%</td>
                  <td className="py-3 pr-4 text-slate-300">{loan.termDays}d</td>
                  <td className={`py-3 pr-4 font-semibold ${STATUS_COLORS[loan.status] ?? 'text-slate-300'}`}>
                    {loan.status}
                  </td>
                  <td className="py-3 text-slate-500">{new Date(loan.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentLoans.length === 0 && (
            <div className="text-center py-12 text-slate-400">No loan data yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
