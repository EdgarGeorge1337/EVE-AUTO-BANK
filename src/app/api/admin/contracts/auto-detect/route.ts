// Replaced by monitoring.ts detectContracts() — kept as manual trigger endpoint
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { detectContracts } from '@/lib/monitoring';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await detectContracts();
  return NextResponse.json(result);
}
