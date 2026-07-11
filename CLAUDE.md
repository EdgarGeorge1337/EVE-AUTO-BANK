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
| `src/app/` | Next.js App Router pages: `dashboard/`, `loans/`, `trading/`, `fund/`, `admin/`, `auth/`, `transparency/`, `api/` |
| `src/lib/` | Core logic: `loans.ts` (loan lifecycle), `trading.ts` (trade desk), `fund.ts` (index fund + NAV), `insights.ts` (market signals), `mer.ts` (CCP Monthly Economic Report ingestion), `credit-score.ts`, `insurance.ts`, `monitoring.ts`, `esi.ts`, `janice.ts`, `db.ts` (Prisma client singleton) |
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

## Investment platform (added 2026-07-11)

Three modules beyond loans; all follow the loans pattern (ESI has no write access → admin fulfils in-game, app is the ledger/queue):

- **Trading desk** (`/trading`, `src/lib/trading.ts`): users buy/sell any Janice-priced item against the bank at Jita split ± spread (`TRADE_SPREAD_PCT`, default 3%). `TradeOrder` lifecycle OPEN → RECEIVED → COMPLETED; expiry via monitoring.
- **Index fund** (`/fund`, `src/lib/fund.ts`): bank-operated basket. Subscribe ISK → units at NAV/unit; redeem at NAV. NAV = cash + holdings − future sales tax (sales tax 8% + broker 3%, per Oz's Community Trading Spreadsheet model from theoz.space). Admin records in-game basket trades so NAV stays true. NAV snapshots every cycle → performance stats.
- **Market insights + sector reports** (`src/lib/insights.ts`, `src/lib/mer.ts`): watchlist price snapshots → 24h/7d momentum + advisory BUY/HOLD/SELL; per-region monthly economy figures parsed from CCP's MER zips (data.everef.net mirror, plotly HTML → `SectorReport` rows, checked daily). Watchlist configurable via `BankConfig` key `trade_watchlist` (comma-separated).

**Monitoring:** `evebank-monitor.timer` (systemd, 15 min) hits `/api/cron/monitor` with `CRON_SECRET` from `.env` — drives payment detection, trade/fund expiry, NAV snapshots, price snapshots, MER refresh.

## Files to never read

`node_modules/`, `package-lock.json`, `.next/`, `prisma/dev.db`, `**/*.min.js`
