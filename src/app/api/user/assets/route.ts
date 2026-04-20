import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';

const ESI_BASE = 'https://esi.evetech.net/latest';

async function esiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${ESI_BASE}${path}?datasource=tranquility`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ESI ${path} [${res.status}]`);
  return res.json() as Promise<T>;
}

async function resolveTypeIds(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const res = await fetch(`${ESI_BASE}/universe/names/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(ids),
  });
  if (!res.ok) return new Map();
  const data = await res.json() as { id: number; name: string; category: string }[];
  return new Map(data.filter(d => d.category === 'inventory_type').map(d => [d.id, d.name]));
}

async function refreshToken(accountId: string, refreshTok: string): Promise<string | null> {
  const account = await db.account.findFirst({ where: { id: accountId } });
  if (!account) return null;

  const credentials = Buffer.from(`${process.env.ESI_CLIENT_ID}:${process.env.ESI_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshTok }).toString(),
  });
  if (!res.ok) return null;
  const tokens = await res.json() as { access_token: string; refresh_token: string; expires_in: number };

  await db.account.update({
    where: { id: accountId },
    data: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    },
  });
  return tokens.access_token;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await db.account.findFirst({
    where: { userId: session.user.id, provider: 'eveonline' },
  });

  if (!account?.access_token) {
    return NextResponse.json({ error: 'No ESI token — please sign out and sign back in to grant asset permissions.' }, { status: 403 });
  }

  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  // Refresh token if expired
  let token = account.access_token;
  const expiresAt = account.expires_at ?? 0;
  if (Date.now() / 1000 > expiresAt - 60 && account.refresh_token) {
    token = (await refreshToken(account.id, account.refresh_token)) ?? token;
  }

  let assets: { type_id: number; quantity: number; location_flag: string; is_singleton: boolean }[];
  try {
    assets = await esiGet(`/characters/${character.characterId}/assets/`, token);
  } catch {
    // Token may be stale — try refresh
    if (account.refresh_token) {
      const refreshed = await refreshToken(account.id, account.refresh_token);
      if (!refreshed) return NextResponse.json({ error: 'Token expired — please sign out and sign back in.' }, { status: 403 });
      try {
        assets = await esiGet(`/characters/${character.characterId}/assets/`, refreshed);
      } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 502 });
      }
    } else {
      return NextResponse.json({ error: 'Token expired — please sign out and sign back in.' }, { status: 403 });
    }
  }

  // Only include items in hangar/inventory, not fitted to ships
  const HANGAR_FLAGS = new Set(['Hangar', 'AutoFit', 'CorpDeliveries', 'Unlocked', 'cargo', 'Cargo']);
  const tradeable = assets.filter(a =>
    !a.is_singleton && a.quantity > 0 && HANGAR_FLAGS.has(a.location_flag)
  );

  // Resolve type IDs to names in batches of 1000
  const typeIds = [...new Set(tradeable.map(a => a.type_id))];
  const nameMap = await resolveTypeIds(typeIds.slice(0, 1000));

  // Aggregate by type
  const aggregated = new Map<number, { name: string; qty: number }>();
  for (const asset of tradeable) {
    const name = nameMap.get(asset.type_id);
    if (!name) continue;
    const existing = aggregated.get(asset.type_id);
    if (existing) existing.qty += asset.quantity;
    else aggregated.set(asset.type_id, { name, qty: asset.quantity });
  }

  const items = [...aggregated.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, qty }) => ({ name, qty, text: `${qty} ${name}` }));

  return NextResponse.json({ items, rawText: items.map(i => i.text).join('\n') });
}
