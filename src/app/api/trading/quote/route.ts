import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { getTradeQuote } from '@/lib/trading';
import { z } from 'zod';

const quoteSchema = z.object({
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
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await getTradeQuote(parsed.data.typeName, parsed.data.qty, parsed.data.side);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 422 });
  }
}
