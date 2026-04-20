// ============================================================
// App 1 — Customer SSO (Authentication Only)
// Uses ESI_CLIENT_ID + ESI_CLIENT_SECRET
// No scopes requested — identity proof only
// Stores: characterId, characterName, corporation, isAdmin flag
// Does NOT store ESI access/refresh tokens on the customer
//
// DEV_MODE=true — adds a fake CredentialsProvider with two
// preset characters (dev user + dev admin). Uses JWT session
// strategy so credentials work without a real OAuth flow.
// ============================================================

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { db } from '@/lib/db';
import { getCharacterPublic, extractJWTClaims } from '@/lib/esi';

const ESI_OAUTH = 'https://login.eveonline.com';
const DEV_MODE = process.env.DEV_MODE === 'true';

// Dev preset characters
const DEV_USER = { characterId: 1000001, characterName: 'Dev Pilot', corporationId: 1000001, isAdmin: false };
const DEV_ADMIN = { characterId: parseInt(process.env.ADMIN_CHARACTER_ID ?? '123456789'), characterName: 'Dev Admin', corporationId: 1000001, isAdmin: true };

export const authOptions: NextAuthOptions = {
  adapter: DEV_MODE ? undefined : PrismaAdapter(db),
  // Credentials providers require JWT — in dev mode use jwt, otherwise database
  session: { strategy: DEV_MODE ? 'jwt' : 'database' },
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    // EVE Online SSO — used in production
    {
      id: 'eveonline',
      name: 'EVE Online',
      type: 'oauth',
      authorization: {
        url: `${ESI_OAUTH}/v2/oauth/authorize`,
        params: { scope: '', response_type: 'code' },
      },
      token: `${ESI_OAUTH}/v2/oauth/token`,
      userinfo: {
        url: 'https://login.eveonline.com/oauth/verify',
        async request({ tokens }) {
          const claims = extractJWTClaims(tokens.access_token as string);
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

    // Dev-only credentials provider — remove/disable in production
    ...(DEV_MODE
      ? [
          CredentialsProvider({
            id: 'dev',
            name: 'Dev Login',
            credentials: {
              role: { label: 'Role', type: 'text' },
            },
            async authorize(credentials) {
              const preset = credentials?.role === 'admin' ? DEV_ADMIN : DEV_USER;
              const userId = `dev-${preset.characterId}`;

              // Upsert user
              await db.user.upsert({
                where: { id: userId },
                update: { name: preset.characterName },
                create: {
                  id: userId,
                  name: preset.characterName,
                  email: `${preset.characterId}@eveonline.character`,
                },
              });

              // Upsert character
              await db.character.upsert({
                where: { characterId: preset.characterId },
                update: { characterName: preset.characterName, isAdmin: preset.isAdmin },
                create: {
                  userId,
                  characterId: preset.characterId,
                  characterName: preset.characterName,
                  corporationId: preset.corporationId,
                  isAdmin: preset.isAdmin,
                },
              });

              return {
                id: userId,
                name: preset.characterName,
                email: `${preset.characterId}@eveonline.character`,
                characterId: preset.characterId,
                isAdmin: preset.isAdmin,
              };
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (DEV_MODE && account?.provider === 'dev') return true;
      if (account?.provider !== 'eveonline') return false;
      return true;
    },

    // JWT callback — only active when DEV_MODE=true (jwt strategy)
    async jwt({ token, user }) {
      if (user) {
        const characterId = (user as { characterId?: number }).characterId
          ?? parseInt(user.id);
        const character = await db.character.findFirst({
          where: { characterId: isNaN(characterId) ? undefined : characterId },
        });
        if (character) {
          token.characterId = character.characterId;
          token.characterName = character.characterName;
          token.isAdmin = character.isAdmin;
          token.trustTier = character.trustTier;
          token.creditScore = character.creditScore;
        }
      }
      return token;
    },

    async session({ session, user, token }) {
      if (DEV_MODE && token) {
        // JWT strategy (dev mode)
        session.user.characterId = token.characterId as number;
        session.user.characterName = token.characterName as string;
        session.user.isAdmin = (token.isAdmin as boolean) ?? false;
        session.user.trustTier = (token.trustTier as string) ?? 'BASIC';
        session.user.creditScore = (token.creditScore as number) ?? 500;
      } else if (user) {
        // Database strategy (production)
        session.user.id = user.id;

        let character = await db.character.findUnique({
          where: { userId: user.id },
        });

        if (!character) {
          // First login — User row now exists, safe to create Character
          const characterId = parseInt(user.email?.split('@')[0] ?? '0');
          if (characterId) {
            try {
              const publicInfo = await getCharacterPublic(characterId);
              const isAdmin = characterId === parseInt(process.env.ADMIN_CHARACTER_ID ?? '0');
              character = await db.character.create({
                data: {
                  userId: user.id,
                  characterId,
                  characterName: publicInfo.name,
                  corporationId: publicInfo.corporation_id,
                  allianceId: publicInfo.alliance_id ?? null,
                  isAdmin,
                },
              });
            } catch (err) {
              console.error('Character creation error:', err);
            }
          }
        }

        if (character) {
          session.user.characterId = character.characterId;
          session.user.characterName = character.characterName;
          session.user.isAdmin = character.isAdmin;
          session.user.trustTier = character.trustTier;
          session.user.creditScore = character.creditScore;
        }
      }
      return session;
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};
