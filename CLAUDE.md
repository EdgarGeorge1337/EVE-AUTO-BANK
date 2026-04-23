# EVE Auto Bank — Operating Contract

Automated PLEX-secured lending platform for EVE Online. Players borrow ISK by collateralising PLEX; repayments and credit scoring are tracked via ESI (EVE Swagger Interface) API.

**Live:** https://evebank.gamehostingnode.com → Cloudflare tunnel → localhost:3000  
**Run:** `npm run dev` (dev) · `npm run build && npm start` (prod)  
**Service file:** `/root/EVE-AUTO-BANK/evebank.service`

## Stack

- **Framework:** Next.js 14+ (App Router, TypeScript)
- **DB:** Prisma ORM + SQLite (`prisma/dev.db`)
- **Auth:** Two separate sessions — `src/lib/auth.ts` (customer), `src/lib/auth-admin.ts` (admin)
- **ESI:** EVE Online API client in `src/lib/esi.ts`
- **Pricing:** Janice market data API in `src/lib/janice.ts`
- **Styling:** Tailwind CSS + shadcn/ui (`components.json`)

## Directories that matter

| Path | Contents |
|---|---|
| `src/app/` | Next.js App Router pages: `dashboard/`, `loans/`, `admin/`, `auth/`, `transparency/`, `api/` |
| `src/lib/` | Core logic: `loans.ts` (loan lifecycle), `credit-score.ts`, `insurance.ts`, `monitoring.ts`, `esi.ts`, `janice.ts`, `db.ts` (Prisma client singleton) |
| `src/components/` | Shared React components |
| `src/types/` | TypeScript type definitions |
| `prisma/` | `schema.prisma` (source of truth), `migrations/`, `seed.ts` |

## DB commands

```bash
npm run db:push        # apply schema changes to dev.db without migration
npm run db:generate    # regenerate Prisma client after schema change
npm run db:migrate     # create + apply a named migration
npm run db:studio      # open Prisma Studio browser UI
```

## Key conventions

- Always use the `db` singleton from `src/lib/db.ts` — never instantiate `PrismaClient` directly.
- ESI calls go through `src/lib/esi.ts` — it handles token refresh and rate limiting.
- PLEX collateral value is fetched from Janice (`src/lib/janice.ts`) at loan creation time, not stored.
- Credit score logic lives entirely in `src/lib/credit-score.ts` — touch nothing else to adjust scoring.
- Admin routes are under `src/app/admin/` and gated by `src/lib/auth-admin.ts`.

## Files to never read

`node_modules/`, `package-lock.json`, `.next/`, `prisma/dev.db`, `**/*.min.js`
