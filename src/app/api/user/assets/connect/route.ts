import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';

const ESI_OAUTH = 'https://login.eveonline.com';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = process.env.NEXTAUTH_URL ?? 'https://evebank.gamehostingnode.com';
  const callbackUrl = `${base}/api/user/assets/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ESI_CLIENT_ID ?? '',
    redirect_uri: callbackUrl,
    scope: 'esi-assets.read_assets.v1',
    state: `asset-connect:${session.user.id}`,
  });

  return NextResponse.redirect(`${ESI_OAUTH}/v2/oauth/authorize?${params.toString()}`);
}
