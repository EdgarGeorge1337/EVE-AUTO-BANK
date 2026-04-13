import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { processInsuranceClaim } from '@/lib/loans';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const result = await processInsuranceClaim(id);

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ success: true, claimAmount: result.claimAmount });
}
