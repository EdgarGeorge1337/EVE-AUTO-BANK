import { Suspense } from 'react';
import SignInContent from './signin-content';

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}
