import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';
import { calculateCancellationFee } from '@/lib/loans';
import { CancelLoanButton } from '@/components/cancel-loan-button';
import { FileClaimButton } from '@/components/file-claim-button';
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
      collateralItems: true,
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

  const isMixed = loan.collateralType === 'MIXED';

  // Live collateral re-appraisal — use appropriate items
  const liveAppraisalItems = isMixed && loan.collateralItems.length > 0
    ? loan.collateralItems.map((i) => ({ typeName: i.typeName, qty: i.qty }))
    : [{ typeName: 'PLEX', qty: loan.collateralPlexQty }];
  const liveResult = await appraiseItems(liveAppraisalItems).catch(() => null);
  const liveCollateralValue = liveResult?.totalValue ?? null;
  const liveLtv = liveCollateralValue ? loan.principalAmount / liveCollateralValue : null;
  const daysLeft = Math.ceil((new Date(loan.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const canCancel = ['PENDING', 'APPROVED', 'ACTIVE'].includes(loan.status);
  const cancellationFee = loan.status === 'PENDING' ? 0 : calculateCancellationFee(loan);
  const insurancePremium = loan.insurance?.premiumAmount ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-white">Loan Details</h1>
        <span className={`text-sm font-semibold px-2 py-1 rounded border ${STATUS_COLORS[loan.status]}`}>
          {loan.status}
        </span>
        {canCancel && (
          <div className="ml-auto">
            <CancelLoanButton
              loanId={loan.id}
              status={loan.status}
              cancellationFee={cancellationFee}
              insurancePremium={insurancePremium}
            />
          </div>
        )}
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
            ['Collateral Type', isMixed ? 'Multi-Asset' : 'PLEX'],
            !isMixed ? ['PLEX Quantity', `${loan.collateralPlexQty.toLocaleString()} PLEX`] : null,
            ['Collateral Value', formatISK(loan.collateralPlexValue)],
            ['LTV Ratio', `${(loan.ltvRatio * 100).toFixed(1)}%`],
            ['Interest Rate', `${(loan.interestRate * 100).toFixed(0)}%`],
            ['Term', `${loan.termDays} days`],
            ['Due Date', new Date(loan.dueDate).toLocaleDateString()],
          ].filter((x): x is string[] => x !== null).map(([label, value]) => (
            <div key={label}>
              <div className="text-slate-400">{label}</div>
              <div className="text-white font-semibold mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Multi-asset collateral basket */}
        {isMixed && loan.collateralItems.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-300">Collateral Basket</div>
            <div className="bg-slate-800/50 rounded divide-y divide-slate-700/50">
              {loan.collateralItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="text-white">{item.typeName}</span>
                    <span className="text-slate-400 ml-2">×{item.qty.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white">{formatISK(item.totalValue)}</div>
                    <div className="text-xs text-slate-500">{formatISK(item.unitValue)} each</div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 text-sm font-semibold">
                <span className="text-slate-300">Total at origination</span>
                <span className="text-amber-400">{formatISK(loan.collateralItems.reduce((s, i) => s + i.totalValue, 0))}</span>
              </div>
            </div>
          </div>
        )}

        {loan.collateralContractId && (
          <div className="text-sm">
            <span className="text-slate-400">Contract ID: </span>
            <span className="text-white font-mono">{loan.collateralContractId}</span>
          </div>
        )}
        {loan.insurance && (() => {
          const ins = loan.insurance;
          const claimStatus = ins.claimStatus ?? 'NONE';
          const claimBadge: Record<string, string> = {
            NONE:           'text-slate-400 bg-slate-400/10 border-slate-400/30',
            PENDING_REVIEW: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
            APPROVED:       'text-green-400 bg-green-400/10 border-green-400/30',
            DENIED:         'text-red-400 bg-red-400/10 border-red-400/30',
          };
          const claimLabel: Record<string, string> = {
            NONE: 'Insured',
            PENDING_REVIEW: 'Claim Under Review',
            APPROVED: 'Claim Approved',
            DENIED: 'Claim Denied',
          };
          return (
            <div className={`rounded p-3 text-sm space-y-2 border ${claimBadge[claimStatus] ?? 'border-slate-700 bg-slate-800/50'}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{claimLabel[claimStatus]}</span>
                  <span className="text-xs opacity-70">{ins.coverageTier ?? 'STANDARD'} · {(ins.coveragePercent * 100).toFixed(0)}% coverage</span>
                </div>
                {loan.status === 'DEFAULTED' && claimStatus === 'NONE' && !character.isAdmin && (
                  <FileClaimButton
                    loanId={loan.id}
                    coverageTier={ins.coverageTier ?? 'STANDARD'}
                    coveragePercent={ins.coveragePercent}
                    principalAmount={loan.principalAmount}
                  />
                )}
              </div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>Premium paid: {formatISK(ins.premiumAmount)}</div>
                {ins.claimRequestedAt && (
                  <div>Claim filed: {new Date(ins.claimRequestedAt).toLocaleDateString()}</div>
                )}
                {claimStatus === 'APPROVED' && ins.claimAmount && ins.claimedAt && (
                  <div className="text-green-400">
                    Payout: {formatISK(ins.claimAmount)} on {new Date(ins.claimedAt).toLocaleDateString()}
                  </div>
                )}
                {claimStatus === 'DENIED' && ins.claimDenialReason && (
                  <div className="text-red-400">Denial reason: {ins.claimDenialReason}</div>
                )}
                {claimStatus === 'PENDING_REVIEW' && (
                  <div className="text-yellow-400">Your claim is pending admin review.</div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Live collateral health */}
      {['ACTIVE', 'OVERDUE', 'APPROVED'].includes(loan.status) && liveCollateralValue && liveLtv && (
        <div className="eve-card space-y-3">
          <h2 className="font-semibold text-white">Live Collateral Status</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-slate-400">{isMixed ? 'Current Basket Value' : 'Current PLEX Value'}</div>
              <div className="text-white font-semibold">
                {liveCollateralValue >= 1e9
                  ? `${(liveCollateralValue / 1e9).toFixed(2)}B ISK`
                  : `${(liveCollateralValue / 1e6).toFixed(0)}M ISK`}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Current LTV</div>
              <div className={`font-semibold ${liveLtv > 0.85 ? 'text-red-400' : liveLtv > 0.70 ? 'text-orange-400' : 'text-green-400'}`}>
                {(liveLtv * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">Days Remaining</div>
              <div className={`font-semibold ${daysLeft < 0 ? 'text-red-400' : daysLeft <= 7 ? 'text-orange-400' : 'text-white'}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
              </div>
            </div>
          </div>
          {liveLtv > 0.85 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-300">
              ⚠ Collateral at risk — {isMixed ? 'asset values have dropped' : 'PLEX price has dropped'}. Repay early or add collateral to avoid liquidation.
            </div>
          )}
          {/* Per-item live breakdown for mixed loans */}
          {isMixed && liveResult && liveResult.items.length > 0 && (
            <div className="bg-slate-800/50 rounded divide-y divide-slate-700/50 text-sm mt-1">
              {liveResult.items.map((item) => {
                const orig = loan.collateralItems.find((c) => c.typeName.toLowerCase() === item.name.toLowerCase());
                const change = orig ? ((item.totalValue - orig.totalValue) / orig.totalValue) * 100 : 0;
                return (
                  <div key={item.typeId} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-slate-300">{item.name} ×{item.qty.toLocaleString()}</span>
                    <div className="text-right">
                      <span className="text-white">{formatISK(item.totalValue)}</span>
                      {orig && (
                        <span className={`ml-2 text-xs ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            Contracts are checked every 30 minutes. ISK will be sent after contract acceptance.
          </p>
        </div>
      )}
      {loan.status === 'ACTIVE' && (
        <div className="eve-card border border-green-500/30 space-y-2">
          <h2 className="font-semibold text-green-400">How to Repay</h2>
          <p className="text-sm text-slate-300">
            Send <strong className="text-white">{remaining >= 1e9 ? `${(remaining / 1e9).toFixed(2)}B` : `${(remaining / 1e6).toFixed(0)}M`} ISK</strong> via wallet transfer to <strong className="text-white">{bankCharName}</strong>. Payments are detected automatically within 15 minutes.
          </p>
          <p className="text-xs text-slate-500">You can make partial payments — all transfers are tracked and credited.</p>
        </div>
      )}
      {loan.status === 'OVERDUE' && (
        <div className="eve-card border border-orange-500/30 space-y-2">
          <h2 className="font-semibold text-orange-400">Payment Overdue — Act Now</h2>
          <p className="text-sm text-slate-300">
            Send <strong className="text-white">{remaining >= 1e9 ? `${(remaining / 1e9).toFixed(2)}B` : `${(remaining / 1e6).toFixed(0)}M`} ISK</strong> to <strong className="text-white">{bankCharName}</strong> immediately to avoid default and collateral liquidation.
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
