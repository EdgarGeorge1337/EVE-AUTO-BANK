import { NextRequest, NextResponse } from 'next/server';
import { runMonitoringCycle } from '@/lib/monitoring';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runMonitoringCycle();
  return NextResponse.json(result);
}
