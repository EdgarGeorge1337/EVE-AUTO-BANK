// Admin-only: redirects the bank character to EVE OAuth (App 2)
// Visit this URL once to link the bank character's API tokens

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { getBankAuthUrl } from '@/lib/auth-admin';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  if (!process.env.ESI_ADMIN_CLIENT_ID || process.env.ESI_ADMIN_CLIENT_ID === 'your-admin-api-client-id') {
    return NextResponse.json(
      { error: 'ESI_ADMIN_CLIENT_ID not configured. Set it in .env first.' },
      { status: 500 }
    );
  }

  const authUrl = getBankAuthUrl();
  return NextResponse.redirect(authUrl);
}
