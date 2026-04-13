import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';
import Link from 'next/link';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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

const TRUST_COLORS: Record<string, string> = {
  BASIC: 'text-slate-400 border-slate-500/50 bg-slate-500/10',
  STANDARD: 'text-blue-400 border-blue-500/50 bg-blue-500/10',
  ADVANCED: 'text-amber-400 border-amber-500/50 bg-amber-500/10',
  PREMIUM: 'text-green-400 border-green-500/50 bg-green-500/10',
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

  // Fetch live PLEX price for collateral health
  const plexResult = activeLoan?.collateralPlexQty
    ? await appraiseItems([{ typeName: 'PLEX', qty: activeLoan.collateralPlexQty }]).catch(() => null)
    : null;

  const liveCollateralValue = plexResult?.totalValue ?? null;
  const liveLtv = liveCollateralValue && activeLoan
    ? activeLoan.principalAmount / liveCollateralValue
    : null;

  const totalDue = activeLoan
    ? activeLoan.principalAmount * (1 + activeLoan.interestRate)
    : 0;
  const progress = activeLoan
    ? Math.min((activeLoan.amountRepaid / totalDue) * 100, 100)
    : 0;
  const daysLeft = activeLoan ? daysUntil(new Date(activeLoan.dueDate)) : null;
  const bankCharName = process.env.ADMIN_CHARACTER_NAME ?? 'Bank Character';

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
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TRUST_COLORS[character.trustTier] ?? TRUST_COLORS.BASIC}`}>
                {character.trustTier}
              </span>
              <span className="text-slate-400 text-sm">
                Credit Score: <strong className="text-white">{character.creditScore}</strong>
              </span>
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
        <div className="eve-card border border-blue-500/20 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Active Loan</h2>
            <span className={`font-semibold ${STATUS_COLORS[activeLoan.status]}`}>{activeLoan.status}</span>
          </div>

          {/* Key figures */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Principal</div>
              <div className="text-white font-semibold">{formatISK(activeLoan.principalAmount)}</div>
            </div>
            <div>
              <div className="text-slate-400">Total Due</div>
              <div className="text-white font-semibold">{formatISK(totalDue)}</div>
            </div>
            <div>
              <div className="text-slate-400">Repaid</div>
              <div className="text-white font-semibold">{formatISK(activeLoan.amountRepaid)}</div>
            </div>
            <div>
              <div className="text-slate-400">Remaining</div>
              <div className="text-white font-semibold">{formatISK(Math.max(0, totalDue - activeLoan.amountRepaid))}</div>
            </div>
          </div>

          {/* Repayment progress */}
          {['ACTIVE', 'OVERDUE'].includes(activeLoan.status) && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Repayment progress</span>
                <span className="text-white font-semibold">{progress.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${activeLoan.status === 'OVERDUE' ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Due date + days */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Due Date</div>
              <div className="text-white font-semibold">{new Date(activeLoan.dueDate).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-slate-400">Days Remaining</div>
              <div className={`font-semibold ${daysLeft !== null && daysLeft < 0 ? 'text-red-400' : daysLeft !== null && daysLeft <= 7 ? 'text-orange-400' : 'text-white'}`}>
                {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`) : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">PLEX Collateral</div>
              <div className="text-white font-semibold">{activeLoan.collateralPlexQty.toLocaleString()} PLEX</div>
            </div>
            <div>
              <div className="text-slate-400">Collateral Health</div>
              {liveCollateralValue && liveLtv ? (
                <div className={`font-semibold ${liveLtv > 0.85 ? 'text-red-400' : liveLtv > 0.70 ? 'text-orange-400' : 'text-green-400'}`}>
                  LTV {(liveLtv * 100).toFixed(1)}%
                  {liveLtv > 0.85 ? ' ⚠ At Risk' : liveLtv > 0.70 ? ' Watch' : ' Healthy'}
                </div>
              ) : (
                <div className="text-slate-500 text-xs">Calculating...</div>
              )}
            </div>
          </div>

          {/* Live collateral value */}
          {liveCollateralValue && (
            <div className="bg-slate-800/50 rounded p-3 text-sm flex justify-between items-center">
              <span className="text-slate-400">Current collateral value (live Jita price)</span>
              <span className="text-white font-semibold">{formatISK(liveCollateralValue)}</span>
            </div>
          )}

          {/* Status-specific prompts */}
          {activeLoan.status === 'PENDING' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-sm text-amber-300">
              Your application is under review. You will be notified once approved.
            </div>
          )}
          {activeLoan.status === 'APPROVED' && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm text-blue-300 space-y-1">
              <div className="font-semibold">Action Required: Send PLEX Collateral</div>
              <div>Create an Item Exchange contract in-game to <strong className="text-white">{bankCharName}</strong> for <strong className="text-white">{activeLoan.collateralPlexQty.toLocaleString()} PLEX</strong> at 0 ISK. ISK will be sent after the contract is accepted.</div>
            </div>
          )}
          {activeLoan.status === 'ACTIVE' && (
            <div className="bg-green-500/10 border border-green-500/30 rounded p-3 text-sm text-green-300 space-y-1">
              <div className="font-semibold">How to Repay</div>
              <div>Send <strong className="text-white">{formatISK(Math.max(0, totalDue - activeLoan.amountRepaid))}</strong> via wallet transfer to <strong className="text-white">{bankCharName}</strong>. Payments are detected automatically.</div>
            </div>
          )}
          {activeLoan.status === 'OVERDUE' && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-sm text-orange-300 space-y-1">
              <div className="font-semibold">Payment Overdue</div>
              <div>Send <strong className="text-white">{formatISK(Math.max(0, totalDue - activeLoan.amountRepaid))}</strong> to <strong className="text-white">{bankCharName}</strong> immediately to avoid default and collateral liquidation.</div>
            </div>
          )}

          <Link
            href={`/loans/${activeLoan.id}`}
            className="block text-center border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white px-4 py-2 rounded text-sm transition-colors"
          >
            View Full Loan Details
          </Link>
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
            {character.loans.map((loan) => {
              const due = new Date(loan.dueDate);
              const d = daysUntil(due);
              return (
                <Link key={loan.id} href={`/loans/${loan.id}`} className="eve-card flex items-center justify-between hover:border-slate-600 transition-colors cursor-pointer block">
                  <div className="flex items-center gap-4">
                    <span className={`font-semibold text-sm ${STATUS_COLORS[loan.status]}`}>{loan.status}</span>
                    <span className="text-white">{formatISK(loan.principalAmount)}</span>
                    <span className="text-slate-400 text-sm">{loan.collateralPlexQty} PLEX</span>
                  </div>
                  <div className="text-right">
                    {['ACTIVE', 'OVERDUE'].includes(loan.status) && (
                      <div className={`text-xs font-semibold ${d < 0 ? 'text-red-400' : d <= 7 ? 'text-orange-400' : 'text-slate-400'}`}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}
                      </div>
                    )}
                    <div className="text-slate-500 text-sm">{new Date(loan.createdAt).toLocaleDateString()}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
