// EVE SSO callback for App 2 (bank admin API)
// Receives the auth code, exchanges it for tokens, stores in BankToken table

import { NextRequest, NextResponse } from 'next/server';
import { storeBankToken } from '@/lib/auth-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || state !== 'bank-admin-connect') {
    return NextResponse.redirect(new URL('/admin?error=invalid_callback', req.url));
  }

  const result = await storeBankToken(code);

  if (!result.success) {
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(result.error ?? 'token_failed')}`, req.url)
    );
  }

  return NextResponse.redirect(new URL('/admin?connected=true', req.url));
}
