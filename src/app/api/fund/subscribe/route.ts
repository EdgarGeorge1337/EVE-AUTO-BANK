import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { requestSubscription } from '@/lib/fund';
import { z } from 'zod';

const schema = z.object({ iskAmount: z.number().positive().max(1_000_000_000_000) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  const result = await requestSubscription(character.id, parsed.data.iskAmount);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result, { status: 201 });
}
