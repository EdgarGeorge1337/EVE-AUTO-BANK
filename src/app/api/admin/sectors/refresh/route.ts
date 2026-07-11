import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { refreshSectorReports } from '@/lib/mer';

export const maxDuration = 300; // MER zips are ~65 MB

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await refreshSectorReports(true);
  return NextResponse.json(result);
}
