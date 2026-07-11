// Index fund business logic
// The bank operates a basket of items; users subscribe with ISK and
// receive units at NAV per unit, redeem units for ISK at NAV.
// In-game ISK/asset movement is manual (admin) — this module is the ledger.

import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';

const INITIAL_UNIT_PRICE = parseFloat(process.env.FUND_INITIAL_UNIT_PRICE ?? '1000000'); // 1M ISK
const MIN_SUBSCRIBE_ISK = parseFloat(process.env.FUND_MIN_SUBSCRIBE_ISK ?? '100000000'); // 100M
const MAX_SUBSCRIBE_ISK = parseFloat(process.env.FUND_MAX_SUBSCRIBE_ISK ?? '50000000000'); // 50B
const TX_TTL_HOURS = parseInt(process.env.FUND_TX_TTL_HOURS ?? '48');

// Fee model from Oz's Community Trading Spreadsheet (theoz.space):
// selling inventory in-game costs sales tax + broker fee, so holdings
// carry a "future sales tax" liability and NAV is quoted net of it.
const SALES_TAX_PCT = parseFloat(process.env.TRADE_SALES_TAX_PCT ?? '0.08');
const BROKER_FEE_PCT = parseFloat(process.env.TRADE_BROKER_FEE_PCT ?? '0.03');

export interface FundHoldingView {
  typeName: string;
  typeId: number;
  qty: number;
  unitPrice: number;
  value: number;
  weightPct: number;
  avgCost: number;
  unrealizedPnl: number;    // (unitPrice - avgCost) * qty
  grossMarginPct: number;   // (unitPrice - avgCost) / unitPrice
}

export interface FundNav {
  nav: number;            // net asset value: cash + holdings - future sales tax
  grossNav: number;       // cash + holdings, before liquidation costs
  futureSalesTax: number; // holdingsValue * (sales tax + broker fee)
  navPerUnit: number;
  holdingsValue: number;
  cashBalance: number;
  unitsOutstanding: number;
  holdings: FundHoldingView[];
}

export interface FundActionResult {
  success: boolean;
  txId?: string;
  error?: string;
  units?: number;
  iskAmount?: number;
  navPerUnit?: number;
}

/** The single flagship fund (first ACTIVE fund). */
export async function getActiveFund() {
  return db.indexFund.findFirst({ where: { status: 'ACTIVE' }, include: { holdings: true } });
}

/**
 * Compute live NAV from Janice pricing. Holdings that fail appraisal
 * fall back to their average cost so NAV never silently drops to zero.
 */
export async function computeNav(fundId: string): Promise<FundNav> {
  const fund = await db.indexFund.findUniqueOrThrow({ where: { id: fundId }, include: { holdings: true } });

  let priced = new Map<number, number>();
  if (fund.holdings.length > 0) {
    try {
      const appraisal = await appraiseItems(fund.holdings.map((h) => ({ typeName: h.typeName, qty: 1 })));
      priced = new Map(appraisal.items.map((i) => [i.typeId, i.unitPrice]));
    } catch {
      // Janice down — cost-basis fallback below
    }
  }

  const holdings = fund.holdings.map((h) => {
    const unitPrice = priced.get(h.typeId) ?? h.avgCost;
    const value = unitPrice * h.qty;
    return {
      typeName: h.typeName,
      typeId: h.typeId,
      qty: h.qty,
      unitPrice,
      value,
      avgCost: h.avgCost,
      unrealizedPnl: (unitPrice - h.avgCost) * h.qty,
      grossMarginPct: unitPrice > 0 ? (unitPrice - h.avgCost) / unitPrice : 0,
    };
  });

  const holdingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const futureSalesTax = holdingsValue * (SALES_TAX_PCT + BROKER_FEE_PCT);
  const grossNav = holdingsValue + fund.cashBalance;
  const nav = grossNav - futureSalesTax;
  const navPerUnit = fund.unitsOutstanding > 0 ? nav / fund.unitsOutstanding : INITIAL_UNIT_PRICE;

  return {
    nav,
    grossNav,
    futureSalesTax,
    navPerUnit,
    holdingsValue,
    cashBalance: fund.cashBalance,
    unitsOutstanding: fund.unitsOutstanding,
    holdings: holdings.map((h) => ({ ...h, weightPct: grossNav > 0 ? h.value / grossNav : 0 })),
  };
}

// ── Fund dashboard (modelled on Oz's Community Trading Spreadsheet) ──

export interface FundDashboard {
  nav: FundNav;
  daysRunning: number;
  inceptionNavPerUnit: number;
  changeSinceInceptionPct: number;
  monthlyReturnPct: number | null; // NAV/unit vs ~30 days ago
  weeklyReturnPct: number | null;
  largestPosition: FundHoldingView | null;
  winners: { typeName: string; changePct: number }[]; // best holdings this week
  losers: { typeName: string; changePct: number }[];
}

export async function getFundDashboard(fundId: string): Promise<FundDashboard> {
  const fund = await db.indexFund.findUniqueOrThrow({ where: { id: fundId } });
  const nav = await computeNav(fundId);

  const daysRunning = Math.max(1, Math.floor((Date.now() - fund.createdAt.getTime()) / (24 * 60 * 60 * 1000)));

  const snapshotNear = async (msAgo: number) =>
    db.fundNavSnapshot.findFirst({
      where: { fundId, createdAt: { lte: new Date(Date.now() - msAgo) } },
      orderBy: { createdAt: 'desc' },
    });
  const [monthAgo, weekAgo] = await Promise.all([
    snapshotNear(30 * 24 * 60 * 60 * 1000),
    snapshotNear(7 * 24 * 60 * 60 * 1000),
  ]);

  const returnVs = (past: { navPerUnit: number } | null) =>
    past && past.navPerUnit > 0 ? (nav.navPerUnit - past.navPerUnit) / past.navPerUnit : null;

  // Winners / losers of the week from stored price snapshots
  const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const changes: { typeName: string; changePct: number }[] = [];
  for (const h of nav.holdings) {
    const past = await db.priceSnapshot.findFirst({
      where: { typeId: h.typeId, createdAt: { lte: weekCutoff } },
      orderBy: { createdAt: 'desc' },
    });
    if (past && past.splitPrice > 0) {
      changes.push({ typeName: h.typeName, changePct: (h.unitPrice - past.splitPrice) / past.splitPrice });
    }
  }
  changes.sort((a, b) => b.changePct - a.changePct);

  const largestPosition = nav.holdings.reduce<FundHoldingView | null>(
    (best, h) => (best === null || h.value > best.value ? h : best),
    null
  );

  return {
    nav,
    daysRunning,
    inceptionNavPerUnit: INITIAL_UNIT_PRICE,
    changeSinceInceptionPct: (nav.navPerUnit - INITIAL_UNIT_PRICE) / INITIAL_UNIT_PRICE,
    monthlyReturnPct: returnVs(monthAgo),
    weeklyReturnPct: returnVs(weekAgo),
    largestPosition,
    winners: changes.slice(0, 3).filter((c) => c.changePct > 0),
    losers: changes.slice(-3).reverse().filter((c) => c.changePct < 0),
  };
}

/** User: request a subscription (deposit ISK for units). */
export async function requestSubscription(characterId: string, iskAmount: number): Promise<FundActionResult> {
  const fund = await getActiveFund();
  if (!fund) return { success: false, error: 'No active fund' };

  if (iskAmount < MIN_SUBSCRIBE_ISK) {
    return { success: false, error: `Minimum subscription is ${(MIN_SUBSCRIBE_ISK / 1e6).toFixed(0)}M ISK` };
  }
  if (iskAmount > MAX_SUBSCRIBE_ISK) {
    return { success: false, error: `Maximum subscription is ${(MAX_SUBSCRIBE_ISK / 1e9).toFixed(0)}B ISK` };
  }

  const openCount = await db.fundTransaction.count({
    where: { characterId, status: { in: ['OPEN', 'RECEIVED'] } },
  });
  if (openCount >= 3) return { success: false, error: 'You already have 3 pending fund transactions' };

  const tx = await db.fundTransaction.create({
    data: {
      fundId: fund.id,
      characterId,
      type: 'SUBSCRIBE',
      iskAmount,
      expiresAt: new Date(Date.now() + TX_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      characterId,
      action: 'FUND_SUBSCRIBE_REQUESTED',
      description: `Subscription requested: ${iskAmount.toLocaleString()} ISK into ${fund.name}`,
      metadata: JSON.stringify({ txId: tx.id, fundId: fund.id }),
    },
  });

  return { success: true, txId: tx.id, iskAmount };
}

/** User: request redemption of units for ISK. */
export async function requestRedemption(characterId: string, units: number): Promise<FundActionResult> {
  const fund = await getActiveFund();
  if (!fund) return { success: false, error: 'No active fund' };

  const position = await db.fundPosition.findUnique({
    where: { fundId_characterId: { fundId: fund.id, characterId } },
  });
  if (!position || position.units <= 0) return { success: false, error: 'You hold no units in this fund' };

  // Units already tied up in pending redemptions
  const pendingAgg = await db.fundTransaction.aggregate({
    where: { fundId: fund.id, characterId, type: 'REDEEM', status: { in: ['OPEN', 'RECEIVED'] } },
    _sum: { units: true },
  });
  const available = position.units - (pendingAgg._sum.units ?? 0);
  if (units > available) {
    return { success: false, error: `Only ${available.toFixed(4)} units available (${position.units.toFixed(4)} held, rest pending redemption)` };
  }

  const tx = await db.fundTransaction.create({
    data: {
      fundId: fund.id,
      characterId,
      type: 'REDEEM',
      iskAmount: 0, // payout computed at processing NAV
      units,
      expiresAt: new Date(Date.now() + TX_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      characterId,
      action: 'FUND_REDEEM_REQUESTED',
      description: `Redemption requested: ${units.toFixed(4)} units of ${fund.name}`,
      metadata: JSON.stringify({ txId: tx.id, fundId: fund.id }),
    },
  });

  return { success: true, txId: tx.id, units };
}

/**
 * Admin: process a subscription after confirming the ISK arrived in-game.
 * Issues units at current NAV (net of entry fee, which stays in the fund).
 */
export async function processSubscription(txId: string): Promise<FundActionResult> {
  const tx = await db.fundTransaction.findUnique({ where: { id: txId }, include: { fund: true } });
  if (!tx) return { success: false, error: 'Transaction not found' };
  if (tx.type !== 'SUBSCRIBE') return { success: false, error: 'Not a subscription' };
  if (tx.status !== 'OPEN') return { success: false, error: `Transaction is ${tx.status}, expected OPEN` };

  const { navPerUnit } = await computeNav(tx.fundId);
  const netIsk = tx.iskAmount * (1 - tx.fund.entryFeePct);
  const units = netIsk / navPerUnit;

  await db.$transaction([
    db.fundTransaction.update({
      where: { id: txId },
      data: { status: 'COMPLETED', units, navPerUnit, transferReceivedAt: new Date(), processedAt: new Date() },
    }),
    db.indexFund.update({
      where: { id: tx.fundId },
      // Full deposit enters fund cash; the entry fee accrues to existing holders
      data: { cashBalance: { increment: tx.iskAmount }, unitsOutstanding: { increment: units } },
    }),
    db.fundPosition.upsert({
      where: { fundId_characterId: { fundId: tx.fundId, characterId: tx.characterId } },
      create: { fundId: tx.fundId, characterId: tx.characterId, units, iskInvested: tx.iskAmount },
      update: { units: { increment: units }, iskInvested: { increment: tx.iskAmount } },
    }),
    db.auditLog.create({
      data: {
        characterId: tx.characterId,
        action: 'FUND_SUBSCRIBE_PROCESSED',
        description: `Issued ${units.toFixed(4)} units @ ${navPerUnit.toLocaleString()} ISK/unit for ${tx.iskAmount.toLocaleString()} ISK`,
        metadata: JSON.stringify({ txId }),
      },
    }),
  ]);

  return { success: true, txId, units, navPerUnit };
}

/**
 * Admin: process a redemption — computes the payout at current NAV,
 * burns the units, decrements fund cash. Admin sends the ISK in-game
 * as part of the same action.
 */
export async function processRedemption(txId: string): Promise<FundActionResult> {
  const tx = await db.fundTransaction.findUnique({ where: { id: txId }, include: { fund: true } });
  if (!tx) return { success: false, error: 'Transaction not found' };
  if (tx.type !== 'REDEEM') return { success: false, error: 'Not a redemption' };
  if (tx.status !== 'OPEN') return { success: false, error: `Transaction is ${tx.status}, expected OPEN` };
  if (!tx.units || tx.units <= 0) return { success: false, error: 'Invalid unit count' };

  const position = await db.fundPosition.findUnique({
    where: { fundId_characterId: { fundId: tx.fundId, characterId: tx.characterId } },
  });
  if (!position || position.units < tx.units) return { success: false, error: 'Position no longer covers this redemption' };

  const { navPerUnit } = await computeNav(tx.fundId);
  const payout = tx.units * navPerUnit;

  if (payout > tx.fund.cashBalance) {
    return {
      success: false,
      error: `Fund cash (${tx.fund.cashBalance.toLocaleString()} ISK) cannot cover payout (${payout.toLocaleString()} ISK) — sell holdings first`,
    };
  }

  await db.$transaction([
    db.fundTransaction.update({
      where: { id: txId },
      data: { status: 'COMPLETED', iskAmount: payout, navPerUnit, processedAt: new Date() },
    }),
    db.indexFund.update({
      where: { id: tx.fundId },
      data: { cashBalance: { decrement: payout }, unitsOutstanding: { decrement: tx.units } },
    }),
    db.fundPosition.update({
      where: { fundId_characterId: { fundId: tx.fundId, characterId: tx.characterId } },
      data: { units: { decrement: tx.units }, iskRedeemed: { increment: payout } },
    }),
    db.auditLog.create({
      data: {
        characterId: tx.characterId,
        action: 'FUND_REDEEM_PROCESSED',
        description: `Redeemed ${tx.units.toFixed(4)} units @ ${navPerUnit.toLocaleString()} ISK/unit → payout ${payout.toLocaleString()} ISK`,
        metadata: JSON.stringify({ txId }),
      },
    }),
  ]);

  return { success: true, txId, iskAmount: payout, navPerUnit };
}

/** User or admin: cancel an OPEN fund transaction. */
export async function cancelFundTransaction(txId: string, requesterCharacterId: string, isAdmin: boolean): Promise<FundActionResult> {
  const tx = await db.fundTransaction.findUnique({ where: { id: txId } });
  if (!tx) return { success: false, error: 'Transaction not found' };
  if (!isAdmin && tx.characterId !== requesterCharacterId) return { success: false, error: 'Not your transaction' };
  if (tx.status !== 'OPEN') return { success: false, error: `Only OPEN transactions can be cancelled (is ${tx.status})` };

  await db.fundTransaction.update({ where: { id: txId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  return { success: true, txId };
}

/**
 * Admin: record an in-game basket trade executed with fund cash.
 * BUY: cash → items at `totalIsk` cost. SELL: items → cash.
 */
export async function recordFundTrade(input: {
  side: 'BUY' | 'SELL';
  typeName: string;
  qty: number;
  totalIsk: number;
}): Promise<FundActionResult> {
  const fund = await getActiveFund();
  if (!fund) return { success: false, error: 'No active fund' };
  const { side, typeName, qty, totalIsk } = input;

  // Resolve canonical name/typeId via Janice
  let typeId: number;
  let canonicalName: string;
  try {
    const appraisal = await appraiseItems([{ typeName, qty: 1 }]);
    if (appraisal.items.length === 0) return { success: false, error: `Item not found in Janice: ${typeName}` };
    typeId = appraisal.items[0].typeId;
    canonicalName = appraisal.items[0].name;
  } catch (err) {
    return { success: false, error: String(err instanceof Error ? err.message : err) };
  }

  const holding = await db.fundHolding.findUnique({ where: { fundId_typeId: { fundId: fund.id, typeId } } });

  if (side === 'BUY') {
    if (totalIsk > fund.cashBalance) return { success: false, error: 'Not enough fund cash' };
    const newQty = (holding?.qty ?? 0) + qty;
    const newAvgCost = ((holding?.qty ?? 0) * (holding?.avgCost ?? 0) + totalIsk) / newQty;
    await db.$transaction([
      db.indexFund.update({ where: { id: fund.id }, data: { cashBalance: { decrement: totalIsk } } }),
      db.fundHolding.upsert({
        where: { fundId_typeId: { fundId: fund.id, typeId } },
        create: { fundId: fund.id, typeName: canonicalName, typeId, qty, avgCost: totalIsk / qty },
        update: { qty: newQty, avgCost: newAvgCost },
      }),
      db.auditLog.create({
        data: {
          action: 'FUND_BASKET_BUY',
          description: `Fund bought ${qty}x ${canonicalName} for ${totalIsk.toLocaleString()} ISK`,
          metadata: JSON.stringify({ fundId: fund.id, typeId, qty, totalIsk }),
        },
      }),
    ]);
  } else {
    if (!holding || holding.qty < qty) return { success: false, error: 'Fund does not hold that many' };
    await db.$transaction([
      db.indexFund.update({ where: { id: fund.id }, data: { cashBalance: { increment: totalIsk } } }),
      holding.qty === qty
        ? db.fundHolding.delete({ where: { id: holding.id } })
        : db.fundHolding.update({ where: { id: holding.id }, data: { qty: { decrement: qty } } }),
      db.auditLog.create({
        data: {
          action: 'FUND_BASKET_SELL',
          description: `Fund sold ${qty}x ${canonicalName} for ${totalIsk.toLocaleString()} ISK`,
          metadata: JSON.stringify({ fundId: fund.id, typeId, qty, totalIsk }),
        },
      }),
    ]);
  }

  return { success: true };
}

/** Monitoring hook: snapshot NAV for the performance history. */
export async function snapshotFundNav(): Promise<{ snapshots: number }> {
  const funds = await db.indexFund.findMany({ where: { status: 'ACTIVE' } });
  let count = 0;
  for (const fund of funds) {
    try {
      const nav = await computeNav(fund.id);
      await db.fundNavSnapshot.create({
        data: {
          fundId: fund.id,
          nav: nav.nav,
          navPerUnit: nav.navPerUnit,
          holdingsValue: nav.holdingsValue,
          cashBalance: nav.cashBalance,
          unitsOutstanding: nav.unitsOutstanding,
        },
      });
      count++;
    } catch {
      // skip fund on pricing failure; next cycle retries
    }
  }
  return { snapshots: count };
}

/** Monitoring hook: expire stale OPEN fund transactions. */
export async function expireStaleFundTransactions(): Promise<{ expired: number }> {
  const result = await db.fundTransaction.updateMany({
    where: { status: 'OPEN', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return { expired: result.count };
}
