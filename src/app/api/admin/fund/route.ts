import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { getActiveFund, recordFundTrade } from '@/lib/fund';
import { z } from 'zod';

const createSchema = z.object({
  action: z.literal('create'),
  name: z.string().min(3).max(100),
  description: z.string().min(3).max(2000),
  entryFeePct: z.number().min(0).max(0.1).optional(),
});

const tradeSchema = z.object({
  action: z.literal('trade'),
  side: z.enum(['BUY', 'SELL']),
  typeName: z.string().min(1).max(200),
  qty: z.number().positive().max(1_000_000_000),
  totalIsk: z.number().positive().max(1_000_000_000_000),
});

const schema = z.union([createSchema, tradeSchema]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.action === 'create') {
    const existing = await getActiveFund();
    if (existing) return NextResponse.json({ error: 'An active fund already exists' }, { status: 409 });
    const fund = await db.indexFund.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        entryFeePct: parsed.data.entryFeePct ?? 0.01,
      },
    });
    return NextResponse.json({ success: true, fundId: fund.id }, { status: 201 });
  }

  const result = await recordFundTrade(parsed.data);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
