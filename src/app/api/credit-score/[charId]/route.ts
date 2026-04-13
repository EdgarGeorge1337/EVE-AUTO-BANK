import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateCreditScore } from '@/lib/credit-score';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ charId: string }> }) {
  const { charId } = await params;
  const characterId = parseInt(charId);
  if (isNaN(characterId)) {
    return NextResponse.json({ error: 'Invalid character ID' }, { status: 400 });
  }

  const character = await db.character.findUnique({ where: { characterId } });

  if (!character) {
    return NextResponse.json({
      characterId,
      creditScore: 500,
      trustTier: 'BASIC',
      autoApprovalEligible: false,
      maxLoanMultiplier: 1,
      components: [{ label: 'Base Score', score: 500, max: 500, detail: 'No history found — starting score' }],
      message: 'No history found',
    });
  }

  const result = await calculateCreditScore(character.id);

  return NextResponse.json({
    characterId,
    characterName: character.characterName,
    creditScore: result.total,
    trustTier: result.tier,
    autoApprovalEligible: result.autoApprovalEligible,
    maxLoanMultiplier: result.maxLoanMultiplier,
    components: result.components,
    history: {
      totalLoans: character.totalLoans,
      totalRepaid: character.totalRepaid,
      totalDefaulted: character.totalDefaulted,
    },
  });
}
