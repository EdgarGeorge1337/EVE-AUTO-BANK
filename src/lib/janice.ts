// Janice Asset Appraisal API client
// https://janice.e-351.com — Jita 4-4 market pricing for EVE Online items

const JANICE_BASE = 'https://janice.e-351.com/api/rest';
const JANICE_API_KEY = process.env.JANICE_API_KEY ?? '';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Raw API types ─────────────────────────────────────────────

interface JaniceRawItem {
  date: string;
  market: { id: number; name: string };
  buyPriceMin: number;
  buyPriceAverage: number;
  buyPriceMedian: number;
  buyPriceMax: number;
  buyOrderCount: number;
  buyVolume: number;
  sellPriceMin: number;
  sellPriceAverage: number;
  sellPriceMedian: number;
  sellPriceMax: number;
  sellOrderCount: number;
  sellVolume: number;
  volume: number;
  splitPrice: number;
  itemType: {
    eid: number;
    name: string;
    description: string;
    volume: number;
    packagedVolume: number;
  };
}

// ── Public types ─────────────────────────────────────────────

export interface JaniceAppraisalItem {
  name: string;
  typeId: number;
  qty: number;
  unitPrice: number;  // splitPrice (midpoint of buy/sell spread)
  totalValue: number;
  buyMax: number;
  sellMin: number;
}

export interface JaniceAppraisalResult {
  items: JaniceAppraisalItem[];
  totalValue: number;
  fetchedAt: string;
}

export interface CollateralItemInput {
  typeName: string;
  qty: number;
}

// ── In-process cache ─────────────────────────────────────────
// Keyed by lowercase item name to handle case variations

const priceCache = new Map<string, { raw: JaniceRawItem; expiresAt: number }>();

// ── Core fetch ───────────────────────────────────────────────

async function fetchRaw(names: string[]): Promise<JaniceRawItem[]> {
  if (!JANICE_API_KEY) throw new Error('JANICE_API_KEY is not configured');

  const res = await fetch(`${JANICE_BASE}/v1/pricer?key=${JANICE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: names.join('\n'),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Janice API [${res.status}]: ${text}`);
  }

  return res.json() as Promise<JaniceRawItem[]>;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Appraise a basket of items by name using Janice Jita 4-4 pricing.
 * Items not found in Janice are silently omitted from results.
 */
export async function appraiseItems(
  items: CollateralItemInput[]
): Promise<JaniceAppraisalResult> {
  const now = Date.now();

  // Determine which names need a fresh fetch
  const toFetch = items.filter((i) => {
    const key = i.typeName.toLowerCase();
    const cached = priceCache.get(key);
    return !cached || cached.expiresAt < now;
  });

  if (toFetch.length > 0) {
    const raw = await fetchRaw(toFetch.map((i) => i.typeName));
    for (const r of raw) {
      priceCache.set(r.itemType.name.toLowerCase(), {
        raw: r,
        expiresAt: now + CACHE_TTL_MS,
      });
    }
  }

  const result: JaniceAppraisalItem[] = [];
  for (const item of items) {
    const entry = priceCache.get(item.typeName.toLowerCase());
    if (!entry) continue;
    const r = entry.raw;
    result.push({
      name: r.itemType.name,
      typeId: r.itemType.eid,
      qty: item.qty,
      unitPrice: r.splitPrice,
      totalValue: r.splitPrice * item.qty,
      buyMax: r.buyPriceMax,
      sellMin: r.sellPriceMin,
    });
  }

  return {
    items: result,
    totalValue: result.reduce((sum, i) => sum + i.totalValue, 0),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Appraise a single item by name. Returns total ISK value (unitPrice × qty).
 * Throws if the item is not found.
 */
export async function appraiseSingleItem(typeName: string, qty: number): Promise<number> {
  const result = await appraiseItems([{ typeName, qty }]);
  if (result.items.length === 0) {
    throw new Error(`Item not found in Janice: ${typeName}`);
  }
  return result.totalValue;
}

/**
 * Parse a multi-line item list in the format:
 *   "500 PLEX"
 *   "1000000 Tritanium"
 * Returns CollateralItemInput[].
 */
export function parseItemList(text: string): CollateralItemInput[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const match = line.match(/^(\d[\d,]*)\s+(.+)$/);
      if (!match) return [];
      const qty = parseInt(match[1].replace(/,/g, ''), 10);
      const typeName = match[2].trim();
      if (!qty || !typeName) return [];
      return [{ typeName, qty }];
    });
}
