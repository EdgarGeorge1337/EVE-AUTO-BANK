import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { applyForLoan } from '@/lib/loans';
import { z } from 'zod';

const collateralItemSchema = z.object({
  typeName: z.string().min(1).max(200),
  qty: z.number().int().positive().max(100_000_000),
});

const coverageTierSchema = z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional();

const applySchema = z.union([
  // PLEX-only path
  z.object({
    principalAmount: z.number().positive().max(100_000_000_000),
    plexQty: z.number().int().positive().max(10000),
    collateralItems: z.undefined().optional(),
    termDays: z.number().int().min(7).max(90).optional(),
    wantsInsurance: z.boolean().optional(),
    coverageTier: coverageTierSchema,
  }),
  // Multi-item path
  z.object({
    principalAmount: z.number().positive().max(100_000_000_000),
    plexQty: z.undefined().optional(),
    collateralItems: z.array(collateralItemSchema).min(1).max(50),
    termDays: z.number().int().min(7).max(90).optional(),
    wantsInsurance: z.boolean().optional(),
    coverageTier: coverageTierSchema,
  }),
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const character = await db.character.findUnique({ where: { userId: session.user.id } });
  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  // Check for existing active loans
  const existingActive = await db.loan.count({
    where: { characterId: character.id, status: { in: ['PENDING', 'APPROVED', 'ACTIVE', 'OVERDUE'] } },
  });
  if (existingActive > 0) {
    return NextResponse.json({ error: 'You already have an active loan' }, { status: 409 });
  }

  const result = await applyForLoan({
    characterId: character.id,
    ...parsed.data,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result, { status: 201 });
}
