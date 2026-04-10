import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ charId: string }> }) {
  const { charId } = await params;
  const characterId = parseInt(charId);
  if (isNaN(characterId)) {
    return NextResponse.json({ error: 'Invalid character ID' }, { status: 400 });
  }

  const character = await db.character.findUnique({
    where: { characterId },
    select: {
      characterId: true,
      characterName: true,
      creditScore: true,
      trustTier: true,
      totalLoans: true,
      totalRepaid: true,
      totalDefaulted: true,
    },
  });

  if (!character) {
    return NextResponse.json({ creditScore: 500, trustTier: 'BASIC', message: 'No history found' });
  }

  return NextResponse.json(character);
}
