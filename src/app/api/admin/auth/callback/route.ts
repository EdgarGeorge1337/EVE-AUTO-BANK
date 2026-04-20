// EVE SSO callback for App 2 (bank admin API)
// Receives the auth code, exchanges it for tokens, stores in BankToken table

import { NextRequest, NextResponse } from 'next/server';
import { storeBankToken } from '@/lib/auth-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const base = process.env.NEXTAUTH_URL ?? 'https://evebank.gamehostingnode.com';

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(error)}`, base)
    );
  }

  if (!code || state !== 'bank-admin-connect') {
    return NextResponse.redirect(new URL('/admin?error=invalid_callback', base));
  }

  const result = await storeBankToken(code);

  if (!result.success) {
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(result.error ?? 'token_failed')}`, base)
    );
  }

  return NextResponse.redirect(new URL('/admin?connected=true', base));
}
