import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { getActiveFund, getFundDashboard } from '@/lib/fund';

export async function GET() {
  const fund = await getActiveFund();
  if (!fund) return NextResponse.json({ fund: null });

  const dashboard = await getFundDashboard(fund.id);

  // Position is optional — the fund overview itself is public
  const session = await getServerSession(authOptions);
  let position = null;
  let transactions: unknown[] = [];
  if (session?.user?.id) {
    const character = await db.character.findUnique({ where: { userId: session.user.id } });
    if (character) {
      position = await db.fundPosition.findUnique({
        where: { fundId_characterId: { fundId: fund.id, characterId: character.id } },
      });
      transactions = await db.fundTransaction.findMany({
        where: { fundId: fund.id, characterId: character.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    }
  }

  return NextResponse.json({
    fund: { id: fund.id, name: fund.name, description: fund.description, entryFeePct: fund.entryFeePct },
    dashboard,
    position,
    transactions,
  });
}
