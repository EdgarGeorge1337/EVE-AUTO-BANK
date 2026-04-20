import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function last6Months() {
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    keys.push(monthKey(d));
  }
  return keys;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const months = last6Months();

  const [loans, characters, plexPrices, payments] = await Promise.all([
    db.loan.findMany({
      select: {
        status: true,
        principalAmount: true,
        interestRate: true,
        termDays: true,
        ltvRatio: true,
        createdAt: true,
        completedAt: true,
        defaultedAt: true,
        hasInsurance: true,
        amountRepaid: true,
        collateralPlexQty: true,
      },
    }),
    db.character.findMany({
      select: { trustTier: true, creditScore: true },
    }),
    db.plexPriceCache.findMany({
      orderBy: { fetchedAt: 'asc' },
      take: 60,
      select: { price: true, fetchedAt: true },
    }),
    db.payment.findMany({
      where: { type: 'REGULAR' },
      select: { amount: true, processedAt: true },
    }),
  ]);

  // --- Loan volume by month ---
  const volumeMap = Object.fromEntries(months.map((m) => [m, 0]));
  for (const loan of loans) {
    const k = monthKey(new Date(loan.createdAt));
    if (k in volumeMap) volumeMap[k]++;
  }
  const loanVolume = months.map((m) => ({ month: m, loans: volumeMap[m] }));

  // --- Interest revenue by month (completed loans) ---
  const revenueMap = Object.fromEntries(months.map((m) => [m, 0]));
  for (const loan of loans) {
    if (loan.status === 'COMPLETED' && loan.completedAt) {
      const k = monthKey(new Date(loan.completedAt));
      if (k in revenueMap) {
        revenueMap[k] += loan.principalAmount * loan.interestRate;
      }
    }
  }
  const revenue = months.map((m) => ({ month: m, isk: Math.round(revenueMap[m]) }));

  // --- Status distribution ---
  const statusCount: Record<string, number> = {};
  for (const loan of loans) {
    statusCount[loan.status] = (statusCount[loan.status] ?? 0) + 1;
  }
  const statusDist = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

  // --- LTV buckets ---
  const ltvBuckets = [
    { range: '0–40%', min: 0, max: 0.4, count: 0 },
    { range: '40–50%', min: 0.4, max: 0.5, count: 0 },
    { range: '50–60%', min: 0.5, max: 0.6, count: 0 },
    { range: '60–70%', min: 0.6, max: 0.7, count: 0 },
    { range: '70%+', min: 0.7, max: Infinity, count: 0 },
  ];
  for (const loan of loans) {
    const bucket = ltvBuckets.find((b) => loan.ltvRatio >= b.min && loan.ltvRatio < b.max);
    if (bucket) bucket.count++;
  }

  // --- Trust tier distribution ---
  const tierCount: Record<string, number> = { BASIC: 0, STANDARD: 0, ADVANCED: 0, PREMIUM: 0 };
  for (const c of characters) {
    tierCount[c.trustTier] = (tierCount[c.trustTier] ?? 0) + 1;
  }
  const trustTiers = Object.entries(tierCount).map(([tier, count]) => ({ tier, count }));

  // --- Credit score histogram (buckets of 100) ---
  const scoreLabels = ['300–400', '400–500', '500–600', '600–700', '700–800', '800–900', '900–1000'];
  const scoreCount = Object.fromEntries(scoreLabels.map((l) => [l, 0]));
  for (const c of characters) {
    const bucket = Math.min(Math.floor((c.creditScore - 300) / 100), 6);
    if (bucket >= 0) scoreCount[scoreLabels[bucket]]++;
  }
  const creditScoreDist = scoreLabels.map((label) => ({ label, count: scoreCount[label] }));

  // --- PLEX price history ---
  const plexHistory = plexPrices.map((p) => ({
    date: new Date(p.fetchedAt).toLocaleDateString(),
    price: Math.round(p.price),
  }));

  // --- Summary KPIs ---
  const activeLoans = loans.filter((l) => l.status === 'ACTIVE');
  const completedLoans = loans.filter((l) => l.status === 'COMPLETED');
  const defaultedLoans = loans.filter((l) => l.status === 'DEFAULTED');
  const activeExposure = activeLoans.reduce((sum, l) => sum + l.principalAmount, 0);
  const totalInterestEarned = completedLoans.reduce((sum, l) => sum + l.principalAmount * l.interestRate, 0);
  const totalPlexHeld = activeLoans.reduce((sum, l) => sum + l.collateralPlexQty, 0);
  const avgLtv = loans.length ? loans.reduce((s, l) => s + l.ltvRatio, 0) / loans.length : 0;
  const defaultRate = loans.length ? defaultedLoans.length / loans.length : 0;
  const insuranceRate = loans.length ? loans.filter((l) => l.hasInsurance).length / loans.length : 0;

  return NextResponse.json({
    loanVolume,
    revenue,
    statusDist,
    ltvBuckets: ltvBuckets.map(({ range, count }) => ({ range, count })),
    trustTiers,
    creditScoreDist,
    plexHistory,
    kpis: {
      activeExposure: Math.round(activeExposure),
      totalInterestEarned: Math.round(totalInterestEarned),
      totalPlexHeld,
      avgLtv: parseFloat((avgLtv * 100).toFixed(1)),
      defaultRate: parseFloat((defaultRate * 100).toFixed(1)),
      insuranceRate: parseFloat((insuranceRate * 100).toFixed(1)),
      totalBorrowers: characters.length,
    },
  });
}
