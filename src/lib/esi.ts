// EVE ESI API Client
// Direct ESI integration — no external dependencies
// ESI base: https://esi.evetech.net/latest/

const ESI_BASE = 'https://esi.evetech.net/latest';
const DATASOURCE = 'tranquility';
const PLEX_TYPE_ID = 44992;

// ── Core request helper ──────────────────────────────────────

async function esiGet<T>(path: string, accessToken?: string, page = 1): Promise<{ data: T; pages: number }> {
  const url = new URL(`${ESI_BASE}${path}`);
  url.searchParams.set('datasource', DATASOURCE);
  if (page > 1) url.searchParams.set('page', String(page));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url.toString(), { headers });

  if (res.status === 304) return { data: [] as unknown as T, pages: 0 };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESI ${path} [${res.status}]: ${text}`);
  }

  const pages = parseInt(res.headers.get('X-Pages') ?? '1', 10);
  const data = await res.json() as T;
  return { data, pages };
}

// Fetch all pages of a paginated endpoint
async function esiGetAll<T>(path: string, accessToken?: string): Promise<T[]> {
  const first = await esiGet<T[]>(path, accessToken, 1);
  if (first.pages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: first.pages - 1 }, (_, i) =>
      esiGet<T[]>(path, accessToken, i + 2).then((r) => r.data)
    )
  );

  return [...first.data, ...rest.flat()];
}

// ── Types ────────────────────────────────────────────────────

export interface ESICharacterPublic {
  name: string;
  corporation_id: number;
  alliance_id?: number;
  birthday: string;
  security_status: number;
  gender: string;
  race_id: number;
  bloodline_id: number;
  description?: string;
  faction_id?: number;
}

export interface ESIWalletJournalEntry {
  id: number;
  date: string;
  ref_type: string;
  amount?: number;
  balance?: number;
  first_party_id?: number;
  second_party_id?: number;
  description: string;
  reason?: string;
  context_id?: number;
  context_id_type?: string;
  tax?: number;
  tax_receiver_id?: number;
}

export interface ESIWalletTransaction {
  transaction_id: number;
  date: string;
  type_id: number;
  quantity: number;
  unit_price: number;
  is_buy: boolean;
  is_personal: boolean;
  client_id: number;
  location_id: number;
  journal_ref_id: number;
}

export interface ESIContract {
  contract_id: number;
  issuer_id: number;
  issuer_corporation_id: number;
  assignee_id: number;
  acceptor_id: number;
  type: string; // 'item_exchange' | 'courier' | 'loan' | 'auction'
  status: string; // 'outstanding' | 'in_progress' | 'finished' | 'cancelled' | 'rejected' | 'failed' | 'deleted' | 'reversed'
  availability: string;
  date_issued: string;
  date_expired: string;
  date_accepted?: string;
  date_completed?: string;
  for_corporation: boolean;
  price?: number;
  reward?: number;
  collateral?: number;
  volume?: number;
  days_to_complete?: number;
  start_location_id?: number;
  end_location_id?: number;
  title?: string;
}

export interface ESIContractItem {
  record_id: number;
  type_id: number;
  quantity: number;
  is_included: boolean;  // true = item is offered; false = item is requested
  is_singleton: boolean;
  raw_quantity?: number;
}

export interface ESIAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: string;
  location_flag: string;
  is_singleton: boolean;
  is_blueprint_copy?: boolean;
}

export interface ESIMarketPrice {
  type_id: number;
  adjusted_price?: number;
  average_price?: number;
}

// ── OAuth JWT validation ──────────────────────────────────────
// Replaces deprecated /oauth/verify
// Extracts character info directly from JWT claims (no API call needed)

export interface EVEJWTClaims {
  characterId: number;
  characterName: string;
  scopes: string[];
}

export function extractJWTClaims(accessToken: string): EVEJWTClaims {
  // JWT is base64url encoded — decode the payload (middle segment)
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  );

  // EVE JWT sub format: "CHARACTER:EVE:{characterId}"
  const sub: string = payload.sub ?? '';
  const characterId = parseInt(sub.split(':')[2] ?? '0', 10);
  if (!characterId) throw new Error(`Could not parse character ID from JWT sub: ${sub}`);

  const characterName: string = payload.name ?? '';
  const rawScopes = payload.scp ?? [];
  const scopes: string[] = Array.isArray(rawScopes) ? rawScopes : [rawScopes];

  return { characterId, characterName, scopes };
}

// ── Character ────────────────────────────────────────────────

export async function getCharacterPublic(characterId: number): Promise<ESICharacterPublic> {
  const { data } = await esiGet<ESICharacterPublic>(`/characters/${characterId}/`);
  return data;
}

// ── Wallet Journal ───────────────────────────────────────────
// Fetches ALL pages of journal entries

export async function getCharacterWalletJournal(
  characterId: number,
  accessToken: string
): Promise<ESIWalletJournalEntry[]> {
  return esiGetAll<ESIWalletJournalEntry>(
    `/characters/${characterId}/wallet/journal/`,
    accessToken
  );
}

export async function getCharacterWalletBalance(
  characterId: number,
  accessToken: string
): Promise<number> {
  const { data } = await esiGet<number>(`/characters/${characterId}/wallet/`, accessToken);
  return data;
}

// ── Contracts ────────────────────────────────────────────────
// Fetches ALL pages of contracts

export async function getCharacterContracts(
  characterId: number,
  accessToken: string
): Promise<ESIContract[]> {
  return esiGetAll<ESIContract>(
    `/characters/${characterId}/contracts/`,
    accessToken
  );
}

// Verify a specific contract actually contains the expected PLEX quantity
export async function getContractItems(
  characterId: number,
  contractId: number,
  accessToken: string
): Promise<ESIContractItem[]> {
  return esiGetAll<ESIContractItem>(
    `/characters/${characterId}/contracts/${contractId}/items/`,
    accessToken
  );
}

// Verify contract contains the required PLEX (type 44992, is_included = true)
export async function verifyPlexContract(
  characterId: number,
  contractId: number,
  expectedQty: number,
  accessToken: string
): Promise<{ valid: boolean; actualQty: number; error?: string }> {
  let items: ESIContractItem[];
  try {
    items = await getContractItems(characterId, contractId, accessToken);
  } catch (err) {
    return { valid: false, actualQty: 0, error: String(err) };
  }

  const plexItems = items.filter((i) => i.type_id === PLEX_TYPE_ID && i.is_included);
  const actualQty = plexItems.reduce((sum, i) => sum + i.quantity, 0);

  if (actualQty < expectedQty) {
    return {
      valid: false,
      actualQty,
      error: `Contract contains ${actualQty} PLEX, expected ${expectedQty}`,
    };
  }

  return { valid: true, actualQty };
}

// ── Assets ───────────────────────────────────────────────────
// Fetches ALL pages — confirms bank character holds PLEX in vault

export async function getCharacterAssets(
  characterId: number,
  accessToken: string
): Promise<ESIAsset[]> {
  return esiGetAll<ESIAsset>(
    `/characters/${characterId}/assets/`,
    accessToken
  );
}

export async function getPlexAssetBalance(
  characterId: number,
  accessToken: string
): Promise<number> {
  const assets = await getCharacterAssets(characterId, accessToken);
  return assets
    .filter((a) => a.type_id === PLEX_TYPE_ID)
    .reduce((sum, a) => sum + a.quantity, 0);
}

// ── Market Prices ─────────────────────────────────────────────
// Uses /markets/prices/ — CCP-aggregated across all regions
// Single call, no auth, 1-hour cache — better than polling regional orders

export async function getMarketPrices(): Promise<ESIMarketPrice[]> {
  return esiGetAll<ESIMarketPrice>('/markets/prices/');
}

export async function getPlexMarketPrice(): Promise<number> {
  const prices = await getMarketPrices();
  const plex = prices.find((p) => p.type_id === PLEX_TYPE_ID);

  if (!plex) throw new Error('PLEX not found in market prices');

  // Prefer adjusted_price (CCP-computed, stable), fall back to average
  const price = plex.adjusted_price ?? plex.average_price;
  if (!price) throw new Error('PLEX price data unavailable');

  return price;
}

// Also expose live Jita sell price for display purposes (still no auth needed)
export async function getPlexJitaSellPrice(regionId = 10000002): Promise<number> {
  const orders = await esiGetAll<{
    order_id: number;
    type_id: number;
    price: number;
    volume_remain: number;
    is_buy_order: boolean;
    system_id: number;
  }>(`/markets/${regionId}/orders/?order_type=sell&type_id=${PLEX_TYPE_ID}`);

  // Jita system ID is 30000142 — prefer Jita orders
  const jitaOrders = orders
    .filter((o) => o.system_id === 30000142 && !o.is_buy_order)
    .sort((a, b) => a.price - b.price);

  if (jitaOrders.length) return jitaOrders[0].price;

  // Fall back to cheapest sell anywhere in region
  const regional = orders.filter((o) => !o.is_buy_order).sort((a, b) => a.price - b.price);
  if (regional.length) return regional[0].price;

  throw new Error('No PLEX sell orders found');
}

// Appraise PLEX collateral — uses adjusted price for LTV calculation (conservative)
export async function appraisePlexValue(plexQty: number): Promise<number> {
  const pricePerPlex = await getPlexMarketPrice();
  return pricePerPlex * plexQty;
}
