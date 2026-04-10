// ============================================================
// App 2 — Bank Admin API Token Management
// Uses ESI_ADMIN_CLIENT_ID + ESI_ADMIN_CLIENT_SECRET
// Scopes: wallet, contracts, assets — bank character only
// One-time setup: admin visits /api/admin/auth/connect
// Tokens stored in BankToken table, auto-refreshed as needed
// ============================================================

import { db } from '@/lib/db';
import { extractJWTClaims } from '@/lib/esi';

const ESI_OAUTH = 'https://login.eveonline.com';

const ADMIN_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-assets.read_assets.v1',
].join(' ');

// ── OAuth URL ────────────────────────────────────────────────

export function getBankAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ESI_ADMIN_CLIENT_ID ?? '',
    redirect_uri: process.env.ESI_ADMIN_CALLBACK_URL ?? '',
    scope: ADMIN_SCOPES,
    state: 'bank-admin-connect',
  });

  return `${ESI_OAUTH}/v2/oauth/authorize?${params.toString()}`;
}

// ── Token Exchange ───────────────────────────────────────────

export async function storeBankToken(code: string): Promise<{ success: boolean; error?: string }> {
  const credentials = Buffer.from(
    `${process.env.ESI_ADMIN_CLIENT_ID}:${process.env.ESI_ADMIN_CLIENT_SECRET}`
  ).toString('base64');

  // Exchange code for tokens
  const tokenRes = await fetch(`${ESI_OAUTH}/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return { success: false, error: `Token exchange failed: ${text}` };
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };

  // Extract identity from JWT claims — no API call needed, /oauth/verify is deprecated
  let identity: { characterId: number; characterName: string; scopes: string[] };
  try {
    identity = extractJWTClaims(tokens.access_token);
  } catch (err) {
    return { success: false, error: `JWT extraction failed: ${String(err)}` };
  }

  const expectedId = parseInt(process.env.ADMIN_CHARACTER_ID ?? '0');
  if (identity.characterId !== expectedId) {
    return {
      success: false,
      error: `Wrong character. Expected ID ${expectedId}, got ${identity.characterId} (${identity.characterName}). Please sign in with the bank character.`,
    };
  }

  // Store in BankToken table (upsert — only one row ever)
  await db.bankToken.upsert({
    where: { characterId: identity.characterId },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: identity.scopes.join(' '),
      characterName: identity.characterName,
    },
    create: {
      characterId: identity.characterId,
      characterName: identity.characterName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: identity.scopes.join(' '),
    },
  });

  await db.auditLog.create({
    data: {
      action: 'BANK_TOKEN_UPDATED',
      description: `Bank character ${identity.characterName} (${identity.characterId}) tokens stored/refreshed`,
      metadata: JSON.stringify({ scopes: identity.scopes }),
    },
  });

  return { success: true };
}

// ── Token Retrieval (auto-refresh) ───────────────────────────

export async function getBankAccessToken(): Promise<string> {
  const bankToken = await db.bankToken.findFirst({
    where: { characterId: parseInt(process.env.ADMIN_CHARACTER_ID ?? '0') },
  });

  if (!bankToken) {
    throw new Error('Bank character not connected. Visit /api/admin/auth/connect to set up.');
  }

  const now = new Date();
  const expiresIn = bankToken.tokenExpiry.getTime() - now.getTime();

  // Return current token if still valid for > 5 minutes
  if (expiresIn > 5 * 60 * 1000) {
    return bankToken.accessToken;
  }

  // Refresh token
  const credentials = Buffer.from(
    `${process.env.ESI_ADMIN_CLIENT_ID}:${process.env.ESI_ADMIN_CLIENT_SECRET}`
  ).toString('base64');

  const refreshRes = await fetch(`${ESI_OAUTH}/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: bankToken.refreshToken,
    }).toString(),
  });

  if (!refreshRes.ok) {
    throw new Error('Bank token refresh failed. Re-connect at /api/admin/auth/connect.');
  }

  const newTokens = await refreshRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  await db.bankToken.update({
    where: { characterId: bankToken.characterId },
    data: {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      tokenExpiry: new Date(Date.now() + newTokens.expires_in * 1000),
    },
  });

  return newTokens.access_token;
}

// ── Status Check ─────────────────────────────────────────────

export async function getBankTokenStatus(): Promise<{
  connected: boolean;
  characterName?: string;
  characterId?: number;
  tokenExpiry?: Date;
  scopes?: string;
  needsReconnect?: boolean;
}> {
  const expectedId = parseInt(process.env.ADMIN_CHARACTER_ID ?? '0');
  const token = await db.bankToken.findFirst({ where: { characterId: expectedId } });

  if (!token) return { connected: false };

  const expiresIn = token.tokenExpiry.getTime() - Date.now();
  const needsReconnect = expiresIn < 0; // refresh token itself may be expired

  return {
    connected: true,
    characterName: token.characterName,
    characterId: token.characterId,
    tokenExpiry: token.tokenExpiry,
    scopes: token.scopes,
    needsReconnect,
  };
}
