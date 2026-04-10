'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';

export function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-amber-400">◆</span>
          <span className="text-white">EVE Auto Bank</span>
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Link href="/loans" className="text-slate-300 hover:text-white transition-colors">
            Loans
          </Link>
          <Link href="/transparency" className="text-slate-300 hover:text-white transition-colors">
            Transparency
          </Link>
          {session?.user?.isAdmin && (
            <Link href="/admin" className="text-amber-400 hover:text-amber-300 transition-colors font-medium">
              Admin
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {session ? (
            <div className="flex items-center gap-3">
              {session.user?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.characterName ?? ''}
                  className="w-8 h-8 rounded-full border border-slate-600"
                />
              )}
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-white">{session.user?.characterName}</div>
                <div className="text-xs text-slate-400">
                  Score: {session.user?.creditScore} &bull; {session.user?.trustTier}
                </div>
              </div>
              <Link
                href="/dashboard"
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
              >
                Dashboard
              </Link>
              <button
                onClick={() => signOut()}
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn('eveonline')}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded transition-colors text-sm"
            >
              <span>Sign In with EVE Online</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
