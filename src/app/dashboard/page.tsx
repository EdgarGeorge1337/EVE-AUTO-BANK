import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import Link from 'next/link';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400',
  APPROVED: 'text-blue-400',
  ACTIVE: 'text-green-400',
  OVERDUE: 'text-orange-400',
  DEFAULTED: 'text-red-400',
  COMPLETED: 'text-lime-400',
  CANCELLED: 'text-slate-400',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/dashboard');

  const character = await db.character.findUnique({
    where: { userId: session.user.id },
    include: {
      loans: {
        orderBy: { createdAt: 'desc' },
        include: { insurance: true },
        take: 10,
      },
    },
  });

  if (!character) redirect('/auth/signin');

  const activeLoan = character.loans.find((l) =>
    ['PENDING', 'APPROVED', 'ACTIVE', 'OVERDUE'].includes(l.status)
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src={session.user.image ?? ''}
            alt={character.characterName}
            className="w-16 h-16 rounded-full border-2 border-slate-600"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">{character.characterName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded eve-badge-${character.trustTier.toLowerCase()}`}>
                {character.trustTier}
              </span>
              <span className="text-slate-400 text-sm">Credit Score: <strong className="text-white">{character.creditScore}</strong></span>
            </div>
          </div>
        </div>
        {!activeLoan && (
          <Link
            href="/loans/apply"
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2.5 rounded-lg transition-colors"
          >
            Apply for Loan
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Loans', value: character.totalLoans },
          { label: 'Repaid', value: character.totalRepaid },
          { label: 'Defaults', value: character.totalDefaulted },
        ].map((s) => (
          <div key={s.label} className="eve-card text-center">
            <div className="text-3xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active Loan */}
      {activeLoan && (
        <div className="eve-card border border-blue-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Active Loan</h2>
            <span className={`font-semibold ${STATUS_COLORS[activeLoan.status]}`}>{activeLoan.status}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Principal</div>
              <div className="text-white font-semibold">{formatISK(activeLoan.principalAmount)} ISK</div>
            </div>
            <div>
              <div className="text-slate-400">Total Due</div>
              <div className="text-white font-semibold">
                {formatISK(activeLoan.principalAmount * (1 + activeLoan.interestRate))} ISK
              </div>
            </div>
            <div>
              <div className="text-slate-400">Repaid</div>
              <div className="text-white font-semibold">{formatISK(activeLoan.amountRepaid)} ISK</div>
            </div>
            <div>
              <div className="text-slate-400">Due Date</div>
              <div className="text-white font-semibold">{new Date(activeLoan.dueDate).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-400">PLEX Collateral</div>
              <div className="text-white font-semibold">{activeLoan.collateralPlexQty.toLocaleString()} PLEX</div>
            </div>
            <div>
              <div className="text-slate-400">LTV Ratio</div>
              <div className="text-white font-semibold">{(activeLoan.ltvRatio * 100).toFixed(1)}%</div>
            </div>
          </div>
          {activeLoan.status === 'APPROVED' && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm text-blue-300">
              Your loan is approved! Please send {activeLoan.collateralPlexQty} PLEX via item exchange contract to the bank character.
            </div>
          )}
          {activeLoan.status === 'PENDING' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-sm text-amber-300">
              Your application is under review. You will be notified once approved.
            </div>
          )}
          <div className="flex gap-3">
            <Link
              href={`/loans/${activeLoan.id}`}
              className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white px-4 py-2 rounded text-sm transition-colors"
            >
              View Details
            </Link>
          </div>
        </div>
      )}

      {/* Loan History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Loan History</h2>
        {character.loans.length === 0 ? (
          <div className="eve-card text-center py-12 text-slate-400">
            No loans yet.{' '}
            <Link href="/loans/apply" className="text-amber-400 hover:underline">
              Apply for your first loan
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {character.loans.map((loan) => (
              <Link key={loan.id} href={`/loans/${loan.id}`} className="eve-card flex items-center justify-between hover:border-slate-600 transition-colors cursor-pointer block">
                <div className="flex items-center gap-4">
                  <span className={`font-semibold text-sm ${STATUS_COLORS[loan.status]}`}>{loan.status}</span>
                  <span className="text-white">{formatISK(loan.principalAmount)} ISK</span>
                  <span className="text-slate-400 text-sm">{loan.collateralPlexQty} PLEX</span>
                </div>
                <span className="text-slate-500 text-sm">{new Date(loan.createdAt).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
