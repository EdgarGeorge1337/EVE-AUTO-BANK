import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBankStats } from '@/lib/loans';

export async function GET() {
  const stats = await getBankStats();

  const recentLoans = await db.loan.findMany({
    where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      principalAmount: true,
      status: true,
      ltvRatio: true,
      termDays: true,
      createdAt: true,
      completedAt: true,
      character: { select: { characterName: true } },
    },
  });

  return NextResponse.json({
    stats,
    recentLoans,
    updatedAt: new Date().toISOString(),
  });
}
