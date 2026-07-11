// Market insights — the "smart investments" advisory layer.
// The monitoring cycle snapshots Janice prices for a watchlist;
// insights compare the live price against recent history to produce
// simple momentum signals. Advisory only — never auto-trades.

import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';

const DEFAULT_WATCHLIST = [
  'PLEX',
  'Large Skill Injector',
  'Skill Extractor',
  'Multiple Pilot Training Certificate',
  'Tritanium',
  'Isogen',
  'Zydrine',
  'Megacyte',
];

const SIGNAL_THRESHOLD = 0.03; // ±3% vs 7d average

export interface MarketInsight {
  typeName: string;
  typeId: number;
  price: number;      // current split
  buyMax: number;
  sellMin: number;
  spreadPct: number;  // (sellMin - buyMax) / split
  change24hPct: number | null;
  change7dPct: number | null;
  signal: 'BUY' | 'SELL' | 'HOLD';
  signalReason: string;
}

async function getWatchlist(): Promise<string[]> {
  const config = await db.bankConfig.findUnique({ where: { key: 'trade_watchlist' } });
  if (config?.value) {
    const names = config.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length > 0) return names;
  }
  return DEFAULT_WATCHLIST;
}

/** Monitoring hook: capture a price snapshot per watchlist item.
 *  Fund holdings are always included so the fund's winners/losers
 *  view has history even for items outside the watchlist. */
export async function capturePriceSnapshots(): Promise<{ captured: number; errors: string[] }> {
  const configured = await getWatchlist();
  const holdings = await db.fundHolding.findMany({ select: { typeName: true }, distinct: ['typeName'] });
  const watchlist = [...new Set([...configured, ...holdings.map((h) => h.typeName)])];
  try {
    const appraisal = await appraiseItems(watchlist.map((typeName) => ({ typeName, qty: 1 })));
    for (const item of appraisal.items) {
      await db.priceSnapshot.create({
        data: {
          typeName: item.name,
          typeId: item.typeId,
          buyMax: item.buyMax,
          sellMin: item.sellMin,
          splitPrice: item.unitPrice,
        },
      });
    }
    return { captured: appraisal.items.length, errors: [] };
  } catch (err) {
    return { captured: 0, errors: [String(err instanceof Error ? err.message : err)] };
  }
}

async function averageSince(typeId: number, since: Date): Promise<number | null> {
  const agg = await db.priceSnapshot.aggregate({
    where: { typeId, createdAt: { gte: since } },
    _avg: { splitPrice: true },
  });
  return agg._avg.splitPrice;
}

/**
 * Build insights for the watchlist. Uses stored snapshots for history;
 * falls back gracefully when history is still thin.
 */
export async function getMarketInsights(): Promise<MarketInsight[]> {
  const watchlist = await getWatchlist();
  const appraisal = await appraiseItems(watchlist.map((typeName) => ({ typeName, qty: 1 })));

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const insights: MarketInsight[] = [];
  for (const item of appraisal.items) {
    const [avg24h, avg7d] = await Promise.all([
      averageSince(item.typeId, dayAgo),
      averageSince(item.typeId, weekAgo),
    ]);

    const change24hPct = avg24h ? (item.unitPrice - avg24h) / avg24h : null;
    const change7dPct = avg7d ? (item.unitPrice - avg7d) / avg7d : null;

    let signal: MarketInsight['signal'] = 'HOLD';
    let signalReason = 'Price is near its recent average';
    if (change7dPct !== null) {
      if (change7dPct <= -SIGNAL_THRESHOLD) {
        signal = 'BUY';
        signalReason = `Trading ${(Math.abs(change7dPct) * 100).toFixed(1)}% below its 7-day average`;
      } else if (change7dPct >= SIGNAL_THRESHOLD) {
        signal = 'SELL';
        signalReason = `Trading ${(change7dPct * 100).toFixed(1)}% above its 7-day average`;
      }
    } else {
      signalReason = 'Building price history — check back soon';
    }

    insights.push({
      typeName: item.name,
      typeId: item.typeId,
      price: item.unitPrice,
      buyMax: item.buyMax,
      sellMin: item.sellMin,
      spreadPct: item.unitPrice > 0 ? (item.sellMin - item.buyMax) / item.unitPrice : 0,
      change24hPct,
      change7dPct,
      signal,
      signalReason,
    });
  }

  return insights;
}
