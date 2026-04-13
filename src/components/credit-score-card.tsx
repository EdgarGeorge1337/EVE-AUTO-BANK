import type { ScoreComponent } from '@/lib/credit-score';

function getTierColor(tier: string) {
  switch (tier) {
    case 'PREMIUM': return 'text-green-400 border-green-500/40 bg-green-500/10';
    case 'ADVANCED': return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    case 'STANDARD': return 'text-blue-400 border-blue-500/40 bg-blue-500/10';
    default: return 'text-slate-400 border-slate-500/40 bg-slate-500/10';
  }
}

function getScoreColor(score: number) {
  if (score >= 800) return 'text-green-400';
  if (score >= 700) return 'text-amber-400';
  if (score >= 600) return 'text-blue-400';
  return 'text-slate-400';
}

function getScoreBarColor(score: number) {
  if (score >= 800) return 'bg-green-500';
  if (score >= 700) return 'bg-amber-500';
  if (score >= 600) return 'bg-blue-500';
  return 'bg-slate-500';
}

interface Props {
  score: number;
  tier: string;
  components: ScoreComponent[];
  autoApprovalEligible: boolean;
  maxLoanMultiplier: number;
}

export function CreditScoreCard({ score, tier, components, autoApprovalEligible, maxLoanMultiplier }: Props) {
  const pct = ((score - 300) / 700) * 100; // 300–1000 range

  return (
    <div className="eve-card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Credit Score</h2>
        <span className={`text-xs font-semibold px-2 py-1 rounded border ${getTierColor(tier)}`}>
          {tier}
        </span>
      </div>

      {/* Score + bar */}
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <span className={`text-5xl font-bold ${getScoreColor(score)}`}>{score}</span>
          <span className="text-slate-500 text-sm mb-1">/ 1000</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${getScoreBarColor(score)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-600">
          <span>300</span>
          <span>BASIC</span>
          <span>STANDARD</span>
          <span>ADVANCED</span>
          <span>PREMIUM 1000</span>
        </div>
      </div>

      {/* Perks */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-800/50 rounded p-3">
          <div className="text-slate-400 text-xs">Auto-Approval</div>
          <div className={`font-semibold mt-0.5 ${autoApprovalEligible ? 'text-green-400' : 'text-slate-400'}`}>
            {autoApprovalEligible ? '✓ Eligible' : 'Not yet (need 650+)'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded p-3">
          <div className="text-slate-400 text-xs">Loan Multiplier</div>
          <div className="text-white font-semibold mt-0.5">Up to {maxLoanMultiplier}× previous loan</div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wide">Score Breakdown</div>
        {components.map((c) => (
          <div key={c.label} className="flex items-start justify-between gap-4 text-sm py-1.5 border-b border-slate-800 last:border-0">
            <div>
              <div className="text-slate-300">{c.label}</div>
              <div className="text-slate-500 text-xs mt-0.5">{c.detail}</div>
            </div>
            <div className={`font-semibold whitespace-nowrap ${c.score > 0 ? 'text-green-400' : c.score < 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {c.score > 0 ? '+' : ''}{c.score}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600">
        Score updates automatically after each loan repayment or default. ESI wallet and standings factors coming soon.
      </p>
    </div>
  );
}
