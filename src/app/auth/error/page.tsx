'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: 'Access was denied. Make sure you are signing in with the correct EVE character.',
  Verification: 'The sign-in link has expired or has already been used.',
  OAuthSignin: 'Could not start the EVE Online sign-in flow. Please try again.',
  OAuthCallback: 'Error during the EVE Online callback. Please try again.',
  OAuthCreateAccount: 'Could not create your account. Please try again.',
  SessionRequired: 'You must be signed in to access this page.',
  Default: 'An unexpected error occurred during sign-in. Please try again.',
};

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get('error') ?? 'Default';
  const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="eve-card max-w-md w-full text-center space-y-6">
        <div className="text-red-400 text-5xl">✕</div>
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Sign-in Error</h1>
          <p className="text-slate-400 text-sm">{message}</p>
          {error !== 'Default' && (
            <p className="text-slate-600 text-xs mt-2">Error code: {error}</p>
          )}
        </div>
        <Link
          href="/auth/signin"
          className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-6 py-2.5 rounded transition-colors text-sm"
        >
          Try Again
        </Link>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
