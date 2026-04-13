// Admin appraisal tool endpoint — full Janice breakdown, admin only

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { appraiseItems, parseItemList } from '@/lib/janice';
import { z } from 'zod';

const schema = z.object({
  items: z
    .array(z.object({ typeName: z.string().min(1), qty: z.number().int().positive() }))
    .min(1)
    .max(200)
    .optional(),
  rawText: z.string().max(10000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  let items = parsed.data.items ?? [];
  if (items.length === 0 && parsed.data.rawText) {
    items = parseItemList(parsed.data.rawText).map((i) => ({ typeName: i.typeName, qty: i.qty }));
  }
  if (items.length === 0) {
    return NextResponse.json({ error: 'No items provided' }, { status: 400 });
  }

  try {
    const appraisal = await appraiseItems(items);
    return NextResponse.json(appraisal);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
