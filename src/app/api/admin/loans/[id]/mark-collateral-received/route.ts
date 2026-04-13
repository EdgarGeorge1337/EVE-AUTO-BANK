import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { activateLoan } from '@/lib/loans';
import { z } from 'zod';

const schema = z.object({ contractId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'contractId required' }, { status: 400 });

  const result = await activateLoan(id, parsed.data.contractId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ success: true });
}
