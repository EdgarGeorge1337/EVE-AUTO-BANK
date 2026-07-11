import { NextResponse } from 'next/server';
import { getMarketInsights } from '@/lib/insights';

export const revalidate = 300; // cache 5 min — matches Janice cache TTL

export async function GET() {
  try {
    const insights = await getMarketInsights();
    return NextResponse.json({ insights });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 });
  }
}
