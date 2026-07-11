import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { cancelFundTransaction } from '@/lib/fund';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  const { id } = await params;
  const result = await cancelFundTransaction(id, character.id, character.isAdmin);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
