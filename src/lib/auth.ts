// Legacy re-export shim — all auth logic has moved to:
//   auth-customer.ts (customer SSO)
//   auth-admin.ts    (bank character API tokens)
export { authOptions } from '@/lib/auth-customer';
