import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractJWTClaims } from '@/lib/esi';

const ESI_OAUTH = 'https://login.eveonline.com';

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? 'https://evebank.gamehostingnode.com';
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state') ?? '';
  const error = searchParams.get('error');

  if (error || !code || !state.startsWith('asset-connect:')) {
    return NextResponse.redirect(new URL('/loans/apply?assetError=auth_failed', base));
  }

  const userId = state.replace('asset-connect:', '');

  const credentials = Buffer.from(
    `${process.env.ESI_CLIENT_ID}:${process.env.ESI_CLIENT_SECRET}`
  ).toString('base64');

  const callbackUrl = `${base}/api/user/assets/callback`;

  const tokenRes = await fetch(`${ESI_OAUTH}/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/loans/apply?assetError=token_failed', base));
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  let characterId: number;
  try {
    const claims = extractJWTClaims(tokens.access_token);
    characterId = claims.characterId;
  } catch {
    return NextResponse.redirect(new URL('/loans/apply?assetError=jwt_failed', base));
  }

  // Store token in the Account table for this user
  await db.account.updateMany({
    where: { userId, provider: 'eveonline' },
    data: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      scope: 'esi-assets.read_assets.v1',
    },
  });

  // Also verify the character matches
  const character = await db.character.findUnique({ where: { userId } });
  if (!character || character.characterId !== characterId) {
    return NextResponse.redirect(new URL('/loans/apply?assetError=wrong_character', base));
  }

  return NextResponse.redirect(new URL('/loans/apply?assetsConnected=1', base));
}
