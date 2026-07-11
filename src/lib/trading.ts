// Trading desk business logic
// Bank buys/sells items at Janice Jita split price ± spread.
// ESI has no write access — the admin fulfils transfers in-game;
// this module tracks quotes and the order lifecycle.

import { db } from '@/lib/db';
import { appraiseItems } from '@/lib/janice';
import type { TradeSide, TradeStatus } from '@prisma/client';

const SPREAD_PCT = parseFloat(process.env.TRADE_SPREAD_PCT ?? '0.03');
const MIN_ORDER_ISK = parseFloat(process.env.TRADE_MIN_ORDER_ISK ?? '50000000'); // 50M
const MAX_ORDER_ISK = parseFloat(process.env.TRADE_MAX_ORDER_ISK ?? '20000000000'); // 20B
const MAX_OPEN_ORDERS = parseInt(process.env.TRADE_MAX_OPEN_ORDERS ?? '3');
const ORDER_TTL_HOURS = parseInt(process.env.TRADE_ORDER_TTL_HOURS ?? '24');

export interface TradeQuote {
  typeName: string;
  typeId: number;
  qty: number;
  side: TradeSide;
  marketPrice: number; // Janice split per unit
  unitPrice: number;   // after spread
  totalValue: number;
  spreadPct: number;
  fetchedAt: string;
}

export interface TradeOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
  quote?: TradeQuote;
}

function applySpread(splitPrice: number, side: TradeSide): number {
  // Player BUYs from the bank → bank sells above market.
  // Player SELLs to the bank → bank buys below market.
  return side === 'BUY' ? splitPrice * (1 + SPREAD_PCT) : splitPrice * (1 - SPREAD_PCT);
}

/**
 * Quote a trade at current Janice pricing. Throws if the item is unknown.
 */
export async function getTradeQuote(typeName: string, qty: number, side: TradeSide): Promise<TradeQuote> {
  const appraisal = await appraiseItems([{ typeName, qty }]);
  if (appraisal.items.length === 0) {
    throw new Error(`Item not found in Janice: ${typeName}`);
  }
  const item = appraisal.items[0];
  const unitPrice = applySpread(item.unitPrice, side);
  return {
    typeName: item.name,
    typeId: item.typeId,
    qty,
    side,
    marketPrice: item.unitPrice,
    unitPrice,
    totalValue: unitPrice * qty,
    spreadPct: SPREAD_PCT,
    fetchedAt: appraisal.fetchedAt,
  };
}

/**
 * Create a trade order. Re-quotes server-side — the client's displayed
 * quote is informational only, never trusted.
 */
export async function createTradeOrder(input: {
  characterId: string; // db Character.id
  side: TradeSide;
  typeName: string;
  qty: number;
}): Promise<TradeOrderResult> {
  const { characterId, side, typeName, qty } = input;

  const openCount = await db.tradeOrder.count({
    where: { characterId, status: { in: ['OPEN', 'RECEIVED'] } },
  });
  if (openCount >= MAX_OPEN_ORDERS) {
    return { success: false, error: `You already have ${openCount} open trade orders (max ${MAX_OPEN_ORDERS})` };
  }

  let quote: TradeQuote;
  try {
    quote = await getTradeQuote(typeName, qty, side);
  } catch (err) {
    return { success: false, error: String(err instanceof Error ? err.message : err) };
  }

  if (quote.totalValue < MIN_ORDER_ISK) {
    return { success: false, error: `Order value below minimum (${(MIN_ORDER_ISK / 1e6).toFixed(0)}M ISK)` };
  }
  if (quote.totalValue > MAX_ORDER_ISK) {
    return { success: false, error: `Order value above maximum (${(MAX_ORDER_ISK / 1e9).toFixed(0)}B ISK)` };
  }

  const order = await db.tradeOrder.create({
    data: {
      characterId,
      side,
      typeName: quote.typeName,
      typeId: quote.typeId,
      qty,
      unitPrice: quote.unitPrice,
      totalValue: quote.totalValue,
      marketPrice: quote.marketPrice,
      spreadPct: quote.spreadPct,
      expiresAt: new Date(Date.now() + ORDER_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      characterId,
      action: 'TRADE_ORDER_CREATED',
      description: `${side} ${qty}x ${quote.typeName} @ ${quote.unitPrice.toLocaleString()} ISK (total ${quote.totalValue.toLocaleString()} ISK)`,
      metadata: JSON.stringify({ orderId: order.id, side, qty, typeId: quote.typeId }),
    },
  });

  return { success: true, orderId: order.id, quote };
}

/**
 * Admin: mark the player's transfer as received (ISK for BUY, item contract for SELL).
 */
export async function markTradeReceived(orderId: string, contractId?: string): Promise<TradeOrderResult> {
  const order = await db.tradeOrder.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: 'Order not found' };
  if (order.status !== 'OPEN') return { success: false, error: `Order is ${order.status}, expected OPEN` };

  await db.tradeOrder.update({
    where: { id: orderId },
    data: { status: 'RECEIVED', transferReceivedAt: new Date(), contractId: contractId ?? order.contractId },
  });
  await db.auditLog.create({
    data: {
      characterId: order.characterId,
      action: 'TRADE_TRANSFER_RECEIVED',
      description: `Transfer received for ${order.side} order ${orderId} (${order.qty}x ${order.typeName})`,
      metadata: JSON.stringify({ orderId, contractId }),
    },
  });
  return { success: true, orderId };
}

/**
 * Admin: mark the bank's side as delivered — order complete.
 */
export async function markTradeFulfilled(orderId: string): Promise<TradeOrderResult> {
  const order = await db.tradeOrder.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: 'Order not found' };
  if (order.status !== 'RECEIVED') return { success: false, error: `Order is ${order.status}, expected RECEIVED` };

  await db.tradeOrder.update({
    where: { id: orderId },
    data: { status: 'COMPLETED', fulfilledAt: new Date() },
  });
  await db.auditLog.create({
    data: {
      characterId: order.characterId,
      action: 'TRADE_COMPLETED',
      description: `${order.side} order fulfilled: ${order.qty}x ${order.typeName} for ${order.totalValue.toLocaleString()} ISK`,
      metadata: JSON.stringify({ orderId }),
    },
  });
  return { success: true, orderId };
}

/**
 * Cancel an OPEN order. Owners may cancel their own; admin may cancel any.
 */
export async function cancelTradeOrder(orderId: string, requesterCharacterId: string, isAdmin: boolean): Promise<TradeOrderResult> {
  const order = await db.tradeOrder.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: 'Order not found' };
  if (!isAdmin && order.characterId !== requesterCharacterId) {
    return { success: false, error: 'Not your order' };
  }
  if (order.status !== 'OPEN') {
    return { success: false, error: `Only OPEN orders can be cancelled (order is ${order.status})` };
  }

  await db.tradeOrder.update({
    where: { id: orderId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  await db.auditLog.create({
    data: {
      characterId: order.characterId,
      action: 'TRADE_ORDER_CANCELLED',
      description: `${order.side} order cancelled: ${order.qty}x ${order.typeName}${isAdmin ? ' (by admin)' : ''}`,
      metadata: JSON.stringify({ orderId, byAdmin: isAdmin }),
    },
  });
  return { success: true, orderId };
}

/**
 * Monitoring hook: expire OPEN orders whose funding window has passed.
 */
export async function expireStaleTradeOrders(): Promise<{ expired: number }> {
  const stale = await db.tradeOrder.findMany({
    where: { status: 'OPEN', expiresAt: { lt: new Date() } },
    select: { id: true, characterId: true, side: true, qty: true, typeName: true },
  });
  for (const order of stale) {
    await db.tradeOrder.update({ where: { id: order.id }, data: { status: 'EXPIRED' } });
    await db.auditLog.create({
      data: {
        characterId: order.characterId,
        action: 'TRADE_ORDER_EXPIRED',
        description: `${order.side} order expired unfunded: ${order.qty}x ${order.typeName}`,
        metadata: JSON.stringify({ orderId: order.id }),
      },
    });
  }
  return { expired: stale.length };
}

/**
 * Public stats for the transparency page.
 */
export async function getTradingStats() {
  const [completed, volumeAgg, openCount] = await Promise.all([
    db.tradeOrder.count({ where: { status: 'COMPLETED' } }),
    db.tradeOrder.aggregate({ where: { status: 'COMPLETED' }, _sum: { totalValue: true } }),
    db.tradeOrder.count({ where: { status: { in: ['OPEN', 'RECEIVED'] } } }),
  ]);
  return {
    completedOrders: completed,
    totalVolume: volumeAgg._sum.totalValue ?? 0,
    openOrders: openCount,
    spreadPct: SPREAD_PCT,
  };
}

export type { TradeSide, TradeStatus };
