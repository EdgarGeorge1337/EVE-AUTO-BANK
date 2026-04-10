import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { getPlexMarketPrice } from '@/lib/esi';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cached = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });
  const ageMs = cached ? Date.now() - cached.fetchedAt.getTime() : Infinity;

  // Return cache if fresh (< 30 min)
  if (cached && ageMs < 30 * 60 * 1000) {
    return NextResponse.json({ price: cached.price, fetchedAt: cached.fetchedAt, cached: true });
  }

  // Fetch fresh price
  try {
    const price = await getPlexMarketPrice();
    const record = await db.plexPriceCache.create({ data: { price } });
    return NextResponse.json({ price: record.price, fetchedAt: record.fetchedAt, cached: false });
  } catch (err) {
    if (cached) {
      return NextResponse.json({ price: cached.price, fetchedAt: cached.fetchedAt, cached: true, stale: true });
    }
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
