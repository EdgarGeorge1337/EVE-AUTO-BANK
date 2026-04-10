import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth-customer';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
