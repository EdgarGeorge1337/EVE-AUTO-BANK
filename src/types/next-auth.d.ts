import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      characterId?: number;
      characterName?: string;
      isAdmin?: boolean;
      trustTier?: string;
      creditScore?: number;
    };
  }
}
