# EVE Auto Bank — Dual Auth Implementation Plan

## Overview

The system uses **two completely separate EVE developer applications**:

| App | Purpose | Scopes | Who uses it |
|---|---|---|---|
| **App 1: Customer SSO** | Prove who a borrower is | None | Every borrower on sign-in |
| **App 2: Bank Admin API** | Monitor wallet, contracts, assets | 3 ESI scopes | Only the bank character, once |

---

## Architecture After Refactor

```
src/lib/
├── auth-customer.ts     ← NextAuth config for App 1 (SSO only)
├── auth-admin.ts        ← One-time bank character OAuth + token management
├── esi.ts               ← ESI API calls (unchanged)
├── monitoring.ts        ← Uses bank admin token only
└── loans.ts             ← Business logic (unchanged)

src/app/
├── api/auth/[...nextauth]/route.ts   ← Customer SSO (App 1)
├── api/admin/auth/                   ← Bank character setup (App 2)
│   ├── connect/route.ts              ← Initiates bank char OAuth
│   └── callback/route.ts            ← Stores bank char token
└── api/admin/monitor/route.ts        ← Uses stored bank token

prisma/schema.prisma
└── BankToken model added             ← Stores bank character tokens
```

---

## Step-by-Step Implementation

### Step 1 — Create two EVE developer apps

**In EVE Developer Portal (developers.eveonline.com):**

#### App 1: Customer SSO
- Name: `EVE Auto Bank`
- Connection Type: `Authentication Only`
- Scopes: *(none)*
- Callback URL: `https://evebank.gamehostingnode.com/api/auth/callback/eveonline`
- Copy: `CLIENT_ID_CUSTOMER` and `CLIENT_SECRET_CUSTOMER`

#### App 2: Bank Admin
- Name: `EVE Auto Bank - Admin`
- Connection Type: `Authentication & API Access`
- Scopes:
  - `esi-wallet.read_character_wallet.v1`
  - `esi-contracts.read_character_contracts.v1`
  - `esi-assets.read_assets.v1`
- Callback URL: `https://evebank.gamehostingnode.com/api/admin/auth/callback`
- Copy: `CLIENT_ID_ADMIN` and `CLIENT_SECRET_ADMIN`

---

### Step 2 — Update .env

```env
# App 1 — Customer SSO (no scopes)
ESI_CLIENT_ID="CLIENT_ID_CUSTOMER"
ESI_CLIENT_SECRET="CLIENT_SECRET_CUSTOMER"

# App 2 — Bank Admin API (wallet + contracts + assets)
ESI_ADMIN_CLIENT_ID="CLIENT_ID_ADMIN"
ESI_ADMIN_CLIENT_SECRET="CLIENT_SECRET_ADMIN"
ESI_ADMIN_CALLBACK_URL="https://evebank.gamehostingnode.com/api/admin/auth/callback"

# Bank character (the one that holds PLEX and receives ISK)
ADMIN_CHARACTER_ID="123456789"
ADMIN_CHARACTER_NAME="Your Bank Character Name"
```

---

### Step 3 — Add BankToken model to Prisma schema

Add to `prisma/schema.prisma`:

```prisma
model BankToken {
  id           String   @id @default(cuid())
  characterId  Int      @unique
  accessToken  String
  refreshToken String
  tokenExpiry  DateTime
  scopes       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Run: `DATABASE_URL="file:./dev.db" npx prisma db push`

---

### Step 4 — Create src/lib/auth-customer.ts

This replaces the current `src/lib/auth.ts` for customer-facing NextAuth.

Key differences from current auth.ts:
- Uses `ESI_CLIENT_ID` / `ESI_CLIENT_SECRET` (App 1 — no scopes)
- Does NOT request wallet/contract/asset scopes
- Does NOT store access/refresh tokens on Character model
- Only stores: characterId, characterName, corporationId, creditScore, trustTier

```typescript
// Scopes: empty — SSO identity only
const ESI_SCOPES = '';

// signIn callback: only upsert public character info
// session callback: attach characterId, characterName, isAdmin, creditScore
```

---

### Step 5 — Create src/lib/auth-admin.ts

Handles the one-time OAuth flow for the bank character using App 2.

```typescript
// Generates App 2 OAuth URL with all 3 scopes
export function getBankAuthUrl(): string

// Exchanges code for tokens, stores in BankToken table
export async function storeBankToken(code: string): Promise<void>

// Returns valid access token, refreshing if needed
export async function getBankAccessToken(): Promise<string>
```

---

### Step 6 — Create admin auth API routes

#### src/app/api/admin/auth/connect/route.ts
- Admin-only endpoint
- Redirects to EVE OAuth URL for App 2
- This is a one-time setup — run once to authorise the bank character

#### src/app/api/admin/auth/callback/route.ts
- Receives OAuth code from EVE
- Calls `storeBankToken(code)`
- Redirects to `/admin` with success message

---

### Step 7 — Update src/lib/monitoring.ts

Replace `getValidAccessToken(adminCharacter.id)` with `getBankAccessToken()` from auth-admin.ts.

The monitoring service no longer depends on a Character row having tokens — it uses the dedicated BankToken table instead.

---

### Step 8 — Admin setup page

Add a section to `/admin` page:

```
Bank Character Status
[Character Name] — Token expires: [date]   [Reconnect]
```

The `[Reconnect]` button hits `/api/admin/auth/connect` to re-authorise if the refresh token ever expires.

---

## How It Works End to End

### Customer journey
1. Clicks "Sign In with EVE Online"
2. EVE redirects to App 1 OAuth (no scopes requested)
3. Customer approves → redirected to `https://evebank.gamehostingnode.com/api/auth/callback/eveonline`
4. NextAuth stores session, character name/ID recorded
5. Customer can apply for loans — no ESI calls made on their behalf

### Bank monitoring (automated)
1. Admin runs `/api/admin/auth/connect` once to link bank character
2. Bank character approves App 2 OAuth → tokens stored in BankToken table
3. Every 15 minutes: `/api/admin/monitor` runs
   - Calls `getBankAccessToken()` — refreshes token automatically if needed
   - Scans bank wallet journal for ISK payments matching active loans
   - Scans bank contracts for new PLEX collateral transfers
   - Marks overdue loans, updates payment records

---

## Files to Create / Modify

| Action | File |
|---|---|
| **Rename** | `src/lib/auth.ts` → `src/lib/auth-customer.ts` |
| **Create** | `src/lib/auth-admin.ts` |
| **Modify** | `src/app/api/auth/[...nextauth]/route.ts` — import from auth-customer |
| **Create** | `src/app/api/admin/auth/connect/route.ts` |
| **Create** | `src/app/api/admin/auth/callback/route.ts` |
| **Modify** | `src/lib/monitoring.ts` — use getBankAccessToken() |
| **Modify** | `src/app/admin/page.tsx` — add bank token status section |
| **Modify** | `prisma/schema.prisma` — add BankToken model |
| **Modify** | `.env` — add ESI_ADMIN_CLIENT_ID, ESI_ADMIN_CLIENT_SECRET |
