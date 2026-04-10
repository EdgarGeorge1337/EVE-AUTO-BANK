'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

export default function SignInContent() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-3">
        <div className="text-6xl">◆</div>
        <h1 className="text-3xl font-bold text-white">Sign In to EVE Auto Bank</h1>
        <p className="text-slate-400">Authenticate with your EVE Online character to access banking services.</p>
      </div>
      <button
        onClick={() => signIn('eveonline', { callbackUrl })}
        className="flex items-center gap-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-amber-500/20"
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10S17.523 22 12 22 2 17.523 2 12 6.477 2 12 2zm0 3a7 7 0 100 14A7 7 0 0012 5z" />
        </svg>
        Sign In with EVE Online
      </button>
      <p className="text-xs text-slate-500 text-center max-w-sm">
        We request read-only ESI scopes for wallet journal, contracts, and assets.
        Your credentials are never stored.
      </p>
    </div>
  );
}
