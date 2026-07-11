import { NextResponse } from 'next/server';
import { getSectorReports } from '@/lib/mer';

export const revalidate = 3600; // sector data changes monthly

export async function GET() {
  const reports = await getSectorReports();
  return NextResponse.json(reports);
}
