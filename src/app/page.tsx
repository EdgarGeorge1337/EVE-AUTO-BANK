import Link from 'next/link';
import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';

async function getPublicStats() {
  const [totalLoans, activeLoans, totalVolume, janiceResult] = await Promise.all([
    db.loan.count({ where: { status: { in: ['COMPLETED', 'ACTIVE'] } } }),
    db.loan.count({ where: { status: 'ACTIVE' } }),
    db.loan.aggregate({ _sum: { principalAmount: true }, where: { status: { in: ['ACTIVE', 'COMPLETED'] } } }),
    appraiseItems([{ typeName: 'PLEX', qty: 1 }]).catch(() => null),
  ]);

  return {
    totalLoans,
    activeLoans,
    totalVolume: totalVolume._sum.principalAmount ?? 0,
    plexPrice: janiceResult?.items[0]?.unitPrice ?? null,
  };
}

function formatISK(amount: number): string {
  if (amount >= 1e12) return `${(amount / 1e12).toFixed(2)}T ISK`;
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(2)}B ISK`;
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(2)}M ISK`;
  return `${amount.toLocaleString()} ISK`;
}

export default async function HomePage() {
  const stats = await getPublicStats();

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center py-16 space-y-6">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-4 py-2 rounded-full">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          PLEX-Secured Automated Lending
        </div>
        <h1 className="text-5xl font-bold text-white leading-tight">
          Bank ISK with Confidence.
          <br />
          <span className="text-amber-400">Secured by PLEX.</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Get ISK loans secured by PLEX collateral. Automated ESI verification, transparent rates,
          and real-time monitoring keep both parties protected.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/loans/apply"
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-8 py-3 rounded-lg text-lg transition-colors"
          >
            Apply for a Loan
          </Link>
          <Link
            href="/transparency"
            className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white px-8 py-3 rounded-lg text-lg transition-colors"
          >
            View Transparency Data
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Loans', value: stats.totalLoans.toLocaleString() },
          { label: 'Active Loans', value: stats.activeLoans.toLocaleString() },
          { label: 'Volume Processed', value: formatISK(stats.totalVolume) },
          { label: 'PLEX Price', value: stats.plexPrice ? formatISK(stats.plexPrice) : 'Loading...' },
        ].map((stat) => (
          <div key={stat.label} className="eve-card text-center">
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section className="space-y-8">
        <h2 className="text-2xl font-bold text-white text-center">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: '📋',
              title: 'Apply Online',
              desc: 'Submit your loan application with desired amount and PLEX collateral quantity. Our system auto-appraises PLEX at live Jita prices.',
            },
            {
              icon: '🔒',
              title: 'Send PLEX Collateral',
              desc: 'Create an in-game item exchange contract to the bank character. Our system automatically detects and links your contract.',
            },
            {
              icon: '💰',
              title: 'Receive ISK',
              desc: 'ISK is transferred directly to your character. Pay back on schedule via wallet transfer and PLEX is returned automatically.',
            },
          ].map((f) => (
            <div key={f.title} className="eve-card space-y-3">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Rates */}
      <section className="eve-card space-y-4">
        <h2 className="text-xl font-bold text-white">Standard Terms</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: 'Interest Rate', value: '8% flat', note: 'Per loan term' },
            { label: 'Loan Term', value: '30 days', note: 'Default; 7–90 available' },
            { label: 'Max LTV', value: '70%', note: 'Loan-to-PLEX-value' },
            { label: 'Grace Period', value: '7 days', note: 'After due date' },
          ].map((t) => (
            <div key={t.label} className="bg-slate-800/50 rounded p-3">
              <div className="text-slate-400 text-xs">{t.label}</div>
              <div className="text-white font-semibold mt-1">{t.value}</div>
              <div className="text-slate-500 text-xs mt-0.5">{t.note}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Optional insurance available at 2% premium for 80% principal coverage against default.
        </p>
      </section>
    </div>
  );
}
