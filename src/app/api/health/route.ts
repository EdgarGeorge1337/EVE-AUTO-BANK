import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const plexPrice = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      plexPriceCached: !!plexPrice,
      plexPriceAge: plexPrice
        ? Math.floor((Date.now() - plexPrice.fetchedAt.getTime()) / 60000) + 'm'
        : null,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 503 });
  }
}
