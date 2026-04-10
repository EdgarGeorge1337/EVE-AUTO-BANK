import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import Link from 'next/link';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  APPROVED: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  ACTIVE: 'text-green-400 bg-green-400/10 border-green-400/30',
  OVERDUE: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  DEFAULTED: 'text-red-400 bg-red-400/10 border-red-400/30',
  COMPLETED: 'text-lime-400 bg-lime-400/10 border-lime-400/30',
  CANCELLED: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
};

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const { id } = await params;
  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) redirect('/auth/signin');

  const loan = await db.loan.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { processedAt: 'desc' } },
      insurance: true,
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      character: { select: { characterId: true, characterName: true } },
    },
  });

  if (!loan) notFound();
  if (loan.characterId !== character.id && !character.isAdmin) {
    redirect('/dashboard');
  }

  const totalDue = loan.principalAmount * (1 + loan.interestRate);
  const remaining = totalDue - loan.amountRepaid;
  const progress = Math.min((loan.amountRepaid / totalDue) * 100, 100);
  const bankCharName = process.env.ADMIN_CHARACTER_NAME ?? 'Bank Character';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-white">Loan Details</h1>
        <span className={`text-sm font-semibold px-2 py-1 rounded border ${STATUS_COLORS[loan.status]}`}>
          {loan.status}
        </span>
      </div>

      {/* Key Figures */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Principal', value: formatISK(loan.principalAmount) },
          { label: 'Total Due', value: formatISK(totalDue) },
          { label: 'Repaid', value: formatISK(loan.amountRepaid) },
          { label: 'Remaining', value: formatISK(Math.max(0, remaining)) },
        ].map((s) => (
          <div key={s.label} className="eve-card text-sm">
            <div className="text-slate-400">{s.label}</div>
            <div className="text-white font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {['ACTIVE', 'OVERDUE', 'COMPLETED'].includes(loan.status) && (
        <div className="eve-card space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Repayment Progress</span>
            <span className="text-white font-semibold">{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div
              className="h-3 rounded-full bg-green-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Collateral & Terms */}
      <div className="eve-card space-y-4">
        <h2 className="font-semibold text-white">Loan Terms & Collateral</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {[
            ['PLEX Collateral', `${loan.collateralPlexQty.toLocaleString()} PLEX`],
            ['Collateral Value', formatISK(loan.collateralPlexValue)],
            ['LTV Ratio', `${(loan.ltvRatio * 100).toFixed(1)}%`],
            ['Interest Rate', `${(loan.interestRate * 100).toFixed(0)}%`],
            ['Term', `${loan.termDays} days`],
            ['Due Date', new Date(loan.dueDate).toLocaleDateString()],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-slate-400">{label}</div>
              <div className="text-white font-semibold mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {loan.collateralContractId && (
          <div className="text-sm">
            <span className="text-slate-400">Contract ID: </span>
            <span className="text-white font-mono">{loan.collateralContractId}</span>
          </div>
        )}
        {loan.insurance && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-sm text-amber-300">
            Insured: {(loan.insurance.coveragePercent * 100).toFixed(0)}% coverage &bull; Premium: {formatISK(loan.insurance.premiumAmount)}
            {loan.insurance.claimedAt && ` (Claimed ${new Date(loan.insurance.claimedAt).toLocaleDateString()})`}
          </div>
        )}
      </div>

      {/* Action Prompts */}
      {loan.status === 'APPROVED' && (
        <div className="eve-card border border-blue-500/30 space-y-3">
          <h2 className="font-semibold text-blue-400">Action Required: Send PLEX Collateral</h2>
          <p className="text-sm text-slate-300">
            Create an <strong>Item Exchange</strong> contract in EVE Online:
          </p>
          <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
            <li>Assign to: <strong className="text-white">{bankCharName}</strong></li>
            <li>Item: <strong className="text-white">{loan.collateralPlexQty.toLocaleString()} PLEX</strong></li>
            <li>Price: <strong className="text-white">0 ISK</strong> (collateral, not sale)</li>
          </ul>
          <p className="text-xs text-slate-500">
            Contracts are checked every 30 minutes. ISK will be transferred after contract acceptance.
          </p>
        </div>
      )}

      {/* Payment History */}
      <div className="space-y-3">
        <h2 className="font-semibold text-white">Payment History</h2>
        {loan.payments.length === 0 ? (
          <div className="eve-card text-center text-slate-400 py-6 text-sm">No payments recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {loan.payments.map((p) => (
              <div key={p.id} className="eve-card flex items-center justify-between text-sm">
                <div>
                  <span className="text-white font-semibold">{formatISK(p.amount)}</span>
                  <span className="text-slate-400 ml-2">{p.type}</span>
                  {p.verified && <span className="text-green-400 ml-2 text-xs">✓ Verified</span>}
                </div>
                <span className="text-slate-500">{new Date(p.processedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="space-y-3">
        <h2 className="font-semibold text-white">Activity Log</h2>
        <div className="space-y-1">
          {loan.auditLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-slate-800">
              <span className="text-slate-500 whitespace-nowrap text-xs mt-0.5">
                {new Date(log.createdAt).toLocaleString()}
              </span>
              <div>
                <span className="text-blue-400 font-mono text-xs">{log.action}</span>
                <span className="text-slate-300 ml-2">{log.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
