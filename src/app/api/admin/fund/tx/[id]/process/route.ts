import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { processSubscription, processRedemption } from '@/lib/fund';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const tx = await db.fundTransaction.findUnique({ where: { id } });
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  const result = tx.type === 'SUBSCRIBE' ? await processSubscription(id) : await processRedemption(id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
