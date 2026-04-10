import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { cancelLoan } from '@/lib/loans';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  const loan = await db.loan.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { processedAt: 'desc' } },
      insurance: true,
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  if (loan.characterId !== character.id && !character.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(loan);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  const result = await cancelLoan(id, character.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ success: true });
}
