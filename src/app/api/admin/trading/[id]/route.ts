import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { markTradeReceived, markTradeFulfilled, cancelTradeOrder } from '@/lib/trading';
import { z } from 'zod';

const actionSchema = z.object({
  action: z.enum(['mark-received', 'mark-fulfilled', 'cancel']),
  contractId: z.string().max(100).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const { id } = await params;
  const admin = await db.character.findUnique({ where: { userId: session.user.id } });

  const result =
    parsed.data.action === 'mark-received' ? await markTradeReceived(id, parsed.data.contractId)
    : parsed.data.action === 'mark-fulfilled' ? await markTradeFulfilled(id)
    : await cancelTradeOrder(id, admin?.id ?? '', true);

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
