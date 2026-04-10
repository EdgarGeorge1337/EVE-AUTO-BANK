// ============================================================
// App 1 — Customer SSO (Authentication Only)
// Uses ESI_CLIENT_ID + ESI_CLIENT_SECRET
// No scopes requested — identity proof only
// Stores: characterId, characterName, corporation, isAdmin flag
// Does NOT store ESI access/refresh tokens on the customer
// ============================================================

import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { db } from '@/lib/db';
import { getCharacterPublic, extractJWTClaims } from '@/lib/esi';

const ESI_OAUTH = 'https://login.eveonline.com';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'database' },
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    {
      id: 'eveonline',
      name: 'EVE Online',
      type: 'oauth',
      authorization: {
        url: `${ESI_OAUTH}/v2/oauth/authorize`,
        // No scopes — SSO identity only
        params: { scope: '', response_type: 'code' },
      },
      token: `${ESI_OAUTH}/v2/oauth/token`,
      userinfo: {
        url: 'https://login.eveonline.com/oauth/verify', // kept as url placeholder only; request fn overrides
        // Extract identity from JWT claims — /oauth/verify is deprecated since Nov 2021
        async request({ tokens }) {
          const claims = extractJWTClaims(tokens.access_token as string);
          // Return shape matching what profile() expects
          return {
            CharacterID: claims.characterId,
            CharacterName: claims.characterName,
            sub: String(claims.characterId),
            name: claims.characterName,
          };
        },
      },
      clientId: process.env.ESI_CLIENT_ID,
      clientSecret: process.env.ESI_CLIENT_SECRET,
      profile(profile) {
        return {
          id: String(profile.CharacterID),
          name: profile.CharacterName,
          email: `${profile.CharacterID}@eveonline.character`,
          image: `https://images.evetech.net/characters/${profile.CharacterID}/portrait?size=128`,
        };
      },
    },
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'eveonline') return false;

      const characterId = parseInt(user.id);
      if (isNaN(characterId)) return false;

      try {
        const publicInfo = await getCharacterPublic(characterId);
        const isAdmin = characterId === parseInt(process.env.ADMIN_CHARACTER_ID ?? '0');

        // Upsert character — identity info only, no ESI tokens stored here
        await db.character.upsert({
          where: { characterId },
          update: {
            characterName: publicInfo.name,
            corporationId: publicInfo.corporation_id,
            allianceId: publicInfo.alliance_id ?? null,
            // Explicitly do NOT update accessToken/refreshToken/scopes
            // Those belong to the bank admin character only (auth-admin.ts)
          },
          create: {
            userId: user.id,
            characterId,
            characterName: publicInfo.name,
            corporationId: publicInfo.corporation_id,
            allianceId: publicInfo.alliance_id ?? null,
            isAdmin,
          },
        });

        return true;
      } catch (err) {
        console.error('Customer signIn error:', err);
        return false;
      }
    },

    async session({ session, user }) {
      const character = await db.character.findUnique({
        where: { userId: user.id },
      });

      if (character) {
        session.user.characterId = character.characterId;
        session.user.characterName = character.characterName;
        session.user.isAdmin = character.isAdmin;
        session.user.trustTier = character.trustTier;
        session.user.creditScore = character.creditScore;
      }

      return session;
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};
