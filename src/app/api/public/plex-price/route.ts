import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';

export async function GET() {
  const cached = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });
  const ageMs = cached ? Date.now() - cached.fetchedAt.getTime() : Infinity;

  if (cached && ageMs < 30 * 60 * 1000) {
    return NextResponse.json({ price: cached.price, fetchedAt: cached.fetchedAt, cached: true });
  }

  try {
    const result = await appraiseItems([{ typeName: 'PLEX', qty: 1 }]);
    if (!result.items.length) throw new Error('PLEX not found in Janice');
    const price = result.items[0].unitPrice;
    const record = await db.plexPriceCache.create({ data: { price } });
    return NextResponse.json({ price: record.price, fetchedAt: record.fetchedAt, cached: false });
  } catch (err) {
    if (cached) {
      return NextResponse.json({ price: cached.price, fetchedAt: cached.fetchedAt, cached: true, stale: true });
    }
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
