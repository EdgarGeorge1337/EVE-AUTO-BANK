import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getBankStats } from '@/lib/loans';
import { getBankTokenStatus } from '@/lib/auth-admin';
import { AppraisalTool } from '@/components/appraisal-tool';
import { ActionQueue } from '@/components/action-queue';
import Link from 'next/link';

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T ISK`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ISK`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ISK`;
  return `${n.toLocaleString()} ISK`;
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

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) redirect('/dashboard');

  const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? '7');
  const graceCutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000);

  const [stats, bankTokenStatus, pendingLoans, overdueLoans, recentLogs,
    approvedNoCollateral, activeNoIsk, completedNoReturn, liquidationEligible, insuranceClaims] = await Promise.all([
    getBankStats(),
    getBankTokenStatus(),
    db.loan.findMany({
      where: { status: 'PENDING' },
      include: { character: true, insurance: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.loan.findMany({
      where: { status: 'OVERDUE' },
      include: { character: true },
      orderBy: { dueDate: 'asc' },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        character: { select: { characterName: true } },
      },
    }),
    db.loan.findMany({ where: { status: 'APPROVED', collateralContractId: null }, include: { character: true }, orderBy: { updatedAt: 'asc' } }),
    db.loan.findMany({ where: { status: 'ACTIVE', iskSentAt: null }, include: { character: true }, orderBy: { updatedAt: 'asc' } }),
    db.loan.findMany({ where: { status: 'COMPLETED', returnContractId: null }, include: { character: true }, orderBy: { completedAt: 'asc' } }),
    db.loan.findMany({ where: { status: 'OVERDUE', overdueAt: { lt: graceCutoff } }, include: { character: true }, orderBy: { overdueAt: 'asc' } }),
    db.loan.findMany({ where: { status: 'DEFAULTED', hasInsurance: true, insurance: { claimable: true } }, include: { character: true, insurance: true }, orderBy: { defaultedAt: 'asc' } }),
  ]);

  const queueActions = [
    ...insuranceClaims.map((loan) => ({
      type: 'PROCESS_INSURANCE_CLAIM' as const,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.principalAmount * (loan.insurance?.coveragePercent ?? 0.8),
      description: `Process insurance claim for ${loan.character.characterName} — ${((loan.insurance?.coveragePercent ?? 0.8) * 100).toFixed(0)}% of ${loan.principalAmount.toLocaleString()} ISK`,
      createdAt: loan.defaultedAt?.toISOString() ?? loan.updatedAt.toISOString(),
      urgent: true,
    })),
    ...liquidationEligible.map((loan) => ({
      type: 'LIQUIDATE_COLLATERAL' as const,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.collateralPlexQty,
      description: `Liquidate ${loan.collateralPlexQty} PLEX from ${loan.character.characterName} — grace period expired`,
      createdAt: loan.overdueAt?.toISOString() ?? loan.updatedAt.toISOString(),
      urgent: true,
    })),
    ...approvedNoCollateral.map((loan) => ({
      type: 'ACCEPT_COLLATERAL_CONTRACT' as const,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.collateralPlexQty,
      description: `Accept contract from ${loan.character.characterName} for ${loan.collateralPlexQty} PLEX`,
      createdAt: loan.updatedAt.toISOString(),
    })),
    ...activeNoIsk.map((loan) => ({
      type: 'SEND_ISK' as const,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.principalAmount,
      description: `Send ${loan.principalAmount.toLocaleString()} ISK to ${loan.character.characterName}`,
      createdAt: loan.updatedAt.toISOString(),
    })),
    ...completedNoReturn.map((loan) => ({
      type: 'RETURN_COLLATERAL' as const,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.collateralPlexQty,
      description: `Return ${loan.collateralPlexQty} PLEX to ${loan.character.characterName}`,
      createdAt: loan.completedAt?.toISOString() ?? loan.updatedAt.toISOString(),
    })),
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        <form action="/api/admin/monitor" method="POST">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition-colors"
          >
            Run Monitoring Cycle
          </button>
        </form>
      </div>

      {/* Action Queue */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          Today&apos;s Actions
          {queueActions.length > 0 && (
            <span className="text-sm bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
              {queueActions.length} pending
            </span>
          )}
        </h2>
        <ActionQueue initialActions={queueActions} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Loans', value: stats.totalLoans },
          { label: 'Active', value: stats.activeLoans },
          { label: 'Defaulted', value: stats.defaulted },
          { label: 'Default Rate', value: `${stats.defaultRate.toFixed(1)}%` },
        ].map((s) => (
          <div key={s.label} className="eve-card text-center">
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bank Character API Status */}
      <div className={`eve-card border ${bankTokenStatus.connected && !bankTokenStatus.needsReconnect ? 'border-green-500/30' : 'border-red-500/30'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Bank Character API</h2>
            {bankTokenStatus.connected && !bankTokenStatus.needsReconnect ? (
              <div className="text-sm text-slate-400 mt-1 space-y-0.5">
                <div>
                  <span className="text-green-400 font-semibold">Connected</span>
                  {' — '}{bankTokenStatus.characterName} (ID: {bankTokenStatus.characterId})
                </div>
                <div>Token expires: {bankTokenStatus.tokenExpiry ? new Date(bankTokenStatus.tokenExpiry).toLocaleString() : 'N/A'}</div>
                <div className="text-xs text-slate-500">Scopes: {bankTokenStatus.scopes}</div>
              </div>
            ) : bankTokenStatus.needsReconnect ? (
              <div className="text-sm text-orange-400 mt-1">Token expired — reconnect required</div>
            ) : (
              <div className="text-sm text-red-400 mt-1">
                Not connected — set ESI_ADMIN_CLIENT_ID in .env, then connect below
              </div>
            )}
          </div>
          <Link
            href="/api/admin/auth/connect"
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded text-sm transition-colors whitespace-nowrap"
          >
            {bankTokenStatus.connected ? 'Reconnect' : 'Connect Bank Character'}
          </Link>
        </div>
      </div>

      {/* Pending Loans */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">
          Pending Approval
          {pendingLoans.length > 0 && (
            <span className="ml-2 text-sm bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
              {pendingLoans.length}
            </span>
          )}
        </h2>
        {pendingLoans.length === 0 ? (
          <div className="eve-card text-center text-slate-400 py-6 text-sm">No pending applications.</div>
        ) : (
          <div className="space-y-3">
            {pendingLoans.map((loan) => (
              <div key={loan.id} className="eve-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Link href={`/loans/${loan.id}`} className="font-semibold text-white hover:text-amber-400">
                      {loan.character.characterName}
                    </Link>
                    <div className="text-sm text-slate-400 mt-0.5">
                      {formatISK(loan.principalAmount)} &bull; {loan.collateralPlexQty} PLEX &bull; LTV {(loan.ltvRatio * 100).toFixed(1)}%
                      {loan.insurance && ' &bull; Insured'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Credit Score: {loan.character.creditScore} &bull; {loan.character.trustTier}
                      {loan.autoApprovalEligible && ' &bull; ✓ Auto-approve eligible'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={`/api/admin/loans/${loan.id}/approve`} method="POST">
                      <button
                        type="submit"
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
                      >
                        Approve
                      </button>
                    </form>
                    <Link
                      href={`/loans/${loan.id}`}
                      className="border border-slate-600 hover:border-slate-400 text-slate-300 px-3 py-1.5 rounded text-sm transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overdue Loans */}
      {overdueLoans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            Overdue Loans
            <span className="ml-2 text-sm bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
              {overdueLoans.length}
            </span>
          </h2>
          <div className="space-y-2">
            {overdueLoans.map((loan) => (
              <Link key={loan.id} href={`/loans/${loan.id}`} className="eve-card flex items-center justify-between border-red-500/20 hover:border-red-500/40 transition-colors block">
                <div>
                  <span className="font-semibold text-white">{loan.character.characterName}</span>
                  <span className="text-red-400 ml-3">{formatISK(loan.principalAmount)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">Due: </span>
                  <span className="text-red-400">{new Date(loan.dueDate).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Janice Appraisal Tool */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Asset Appraisal</h2>
        <div className="eve-card">
          <AppraisalTool endpoint="/api/admin/appraise" />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
        <div className="space-y-1">
          {recentLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-slate-800">
              <span className="text-slate-500 whitespace-nowrap text-xs mt-0.5">
                {new Date(log.createdAt).toLocaleString()}
              </span>
              <span className="text-blue-400 font-mono text-xs whitespace-nowrap">{log.action}</span>
              <span className="text-slate-300">{log.description}</span>
              {log.character && (
                <span className="text-slate-500 text-xs whitespace-nowrap">— {log.character.characterName}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
