import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { createTradeOrder } from '@/lib/trading';
import { z } from 'zod';

const createSchema = z.object({
  typeName: z.string().min(1).max(200),
  qty: z.number().int().positive().max(100_000_000),
  side: z.enum(['BUY', 'SELL']),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  const result = await createTradeOrder({ characterId: character.id, ...parsed.data });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json(result, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  const orders = await db.tradeOrder.findMany({
    where: { characterId: character.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ orders });
}
