// Credit scoring engine for EVE Auto Bank
// Score range: 300 (terrible) – 1000 (perfect)
// Tiers: BASIC <600 | STANDARD 600-699 | ADVANCED 700-799 | PREMIUM 800+

import { db } from '@/lib/db';

export interface ScoreComponent {
  label: string;
  score: number;       // contribution to total (can be negative)
  max: number;         // max possible contribution
  detail: string;      // human-readable explanation
}

export interface CreditScoreResult {
  total: number;
  tier: string;
  components: ScoreComponent[];
  autoApprovalEligible: boolean;
  maxLoanMultiplier: number; // how many times their best repaid loan they can borrow
}

const BASE = 500;

export async function calculateCreditScore(characterId: string): Promise<CreditScoreResult> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: {
      loans: {
        select: {
          status: true,
          principalAmount: true,
          amountRepaid: true,
          ltvRatio: true,
          overdueAt: true,
          completedAt: true,
          dueDate: true,
          createdAt: true,
        },
      },
    },
  });

  if (!character) {
    return {
      total: BASE,
      tier: 'BASIC',
      components: [{ label: 'Base Score', score: BASE, max: BASE, detail: 'Starting score for new borrowers' }],
      autoApprovalEligible: false,
      maxLoanMultiplier: 1,
    };
  }

  const loans = character.loans;
  const completed = loans.filter((l) => l.status === 'COMPLETED');
  const defaulted = loans.filter((l) => l.status === 'DEFAULTED');
  const overdue = loans.filter((l) => l.status === 'OVERDUE');
  const active = loans.filter((l) => l.status === 'ACTIVE');

  const components: ScoreComponent[] = [];

  // 1. Base
  components.push({
    label: 'Base Score',
    score: BASE,
    max: BASE,
    detail: 'Starting score for all borrowers',
  });

  // 2. Repayment history (+40 per completed, cap +200)
  const repaymentScore = Math.min(completed.length * 40, 200);
  components.push({
    label: 'Repayment History',
    score: repaymentScore,
    max: 200,
    detail: completed.length > 0
      ? `${completed.length} loan${completed.length > 1 ? 's' : ''} repaid on time (+40 each, max +200)`
      : 'No completed loans yet',
  });

  // 3. Defaults (-150 each, no floor — can go very negative)
  const defaultScore = defaulted.length * -150;
  if (defaulted.length > 0) {
    components.push({
      label: 'Defaults',
      score: defaultScore,
      max: 0,
      detail: `${defaulted.length} default${defaulted.length > 1 ? 's' : ''} on record (-150 each)`,
    });
  }

  // 4. Clean record bonus (+75 if no defaults and at least 1 completed loan)
  if (defaulted.length === 0 && completed.length >= 1) {
    components.push({
      label: 'Clean Record Bonus',
      score: 75,
      max: 75,
      detail: 'No defaults on record',
    });
  }

  // 5. Overdue penalty (-30 per currently overdue loan)
  if (overdue.length > 0) {
    const overdueScore = overdue.length * -30;
    components.push({
      label: 'Overdue Loans',
      score: overdueScore,
      max: 0,
      detail: `${overdue.length} loan${overdue.length > 1 ? 's' : ''} currently overdue (-30 each)`,
    });
  }

  // 6. LTV discipline (+50 if avg LTV on completed loans ≤ 50%)
  if (completed.length > 0) {
    const avgLtv = completed.reduce((s, l) => s + l.ltvRatio, 0) / completed.length;
    if (avgLtv <= 0.5) {
      components.push({
        label: 'Conservative Borrowing',
        score: 50,
        max: 50,
        detail: `Average LTV ${(avgLtv * 100).toFixed(1)}% — borrowing well within collateral value`,
      });
    }
  }

  // 7. Loyalty bonus (+25 per 3 completed loans, max +75)
  if (completed.length >= 3) {
    const loyaltyScore = Math.min(Math.floor(completed.length / 3) * 25, 75);
    components.push({
      label: 'Loyal Customer',
      score: loyaltyScore,
      max: 75,
      detail: `${completed.length} total loans completed (+25 per 3, max +75)`,
    });
  }

  // 8. ESI wallet placeholder (future)
  // When ESI tokens available: check wallet balance, add +50 if >1B ISK
  // components.push({ label: 'Wallet Balance', score: walletScore, max: 50, detail: '...' });

  // 9. ESI standings placeholder (future)
  // When ESI tokens available: check NPC standings
  // components.push({ label: 'NPC Standings', score: standingsScore, max: 50, detail: '...' });

  const total = Math.min(1000, Math.max(300, components.reduce((s, c) => s + c.score, 0)));
  const tier = getTier(total);

  return {
    total,
    tier,
    components,
    autoApprovalEligible: total >= 650 && defaulted.length === 0 && overdue.length === 0,
    maxLoanMultiplier: completed.length === 0 ? 1 : Math.min(5, 1 + Math.floor(completed.length / 2)),
  };
}

export function getTier(score: number): string {
  if (score >= 800) return 'PREMIUM';
  if (score >= 700) return 'ADVANCED';
  if (score >= 600) return 'STANDARD';
  return 'BASIC';
}

export async function recalculateAndSave(characterId: string): Promise<number> {
  const result = await calculateCreditScore(characterId);
  await db.character.update({
    where: { id: characterId },
    data: {
      creditScore: result.total,
      trustTier: result.tier,
    },
  });
  return result.total;
}
