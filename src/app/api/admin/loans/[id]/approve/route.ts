import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { approveLoan } from '@/lib/loans';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await approveLoan(id, body.reason);

  const base = process.env.NEXTAUTH_URL ?? 'https://evebank.gamehostingnode.com';

  if (!result.success) {
    return NextResponse.redirect(new URL(`/admin?error=${encodeURIComponent(result.error ?? 'approve_failed')}`, base));
  }

  return NextResponse.redirect(new URL('/admin?success=Loan+approved+successfully', base));
}
