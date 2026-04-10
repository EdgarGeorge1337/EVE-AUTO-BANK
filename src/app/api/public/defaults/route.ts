import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    interestRate: parseFloat(process.env.BASE_INTEREST_RATE ?? '0.08'),
    maxLtvRatio: parseFloat(process.env.MAX_LTV_RATIO ?? '0.70'),
    termDays: parseInt(process.env.LOAN_TERM_DAYS ?? '30'),
    gracePeriodDays: parseInt(process.env.GRACE_PERIOD_DAYS ?? '7'),
    minCreditScore: 500,
    insuranceRate: 0.02,
    insuranceCoverage: 0.80,
    marketRegion: process.env.DEFAULT_MARKET_REGION_ID ?? '10000002',
  });
}
