// CCP Monthly Economic Report ingestion — the "published monthly
// earnings reports" behind the Sector Reports view.
// Source: https://data.everef.net/ccp/mer/ (community mirror of CCP's MER,
// the dataset the tools listed on theoz.space visualise).
//
// Each MER zip contains plotly HTML charts; 1_regional_stats.html embeds
// the per-region economy figures we extract and store as SectorReport rows.

import { db } from '@/lib/db';
import { unzipSync } from 'fflate';

const MER_BASE = 'https://data.everef.net/ccp/mer';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // re-check the archive daily

// ── Archive discovery ────────────────────────────────────────

async function listZipUrls(year: number): Promise<string[]> {
  const res = await fetch(`${MER_BASE}/${year}/`);
  if (!res.ok) return [];
  const html = await res.text();
  const matches = html.match(/href="([^"]*EVEOnline_MER_\d{6}\.zip)"/g) ?? [];
  return matches
    .map((m) => m.replace(/^href="/, '').replace(/"$/, ''))
    .map((path) => (path.startsWith('http') ? path : `https://data.everef.net${path}`));
}

function monthFromUrl(url: string): string {
  const m = url.match(/EVEOnline_MER_(\d{4})(\d{2})\.zip/);
  return m ? `${m[1]}-${m[2]}` : '';
}

// ── Plotly HTML parsing ──────────────────────────────────────

interface PlotlyTrace {
  name: string;
  x: number[];   // values
  y: string[];   // region names (horizontal bars)
}

function extractPlotlyData(html: string): PlotlyTrace[] {
  const idx = html.lastIndexOf('Plotly.newPlot');
  if (idx === -1) throw new Error('No Plotly.newPlot call found in MER chart');
  const start = html.indexOf('[', idx);
  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) { end = j; break; }
    }
  }
  if (end === -1) throw new Error('Unbalanced Plotly data array');
  return JSON.parse(html.slice(start, end + 1)) as PlotlyTrace[];
}

// ── Import ───────────────────────────────────────────────────

const METRIC_FIELDS: Record<string, string> = {
  mined_value: 'minedValue',
  produced_value: 'producedValue',
  destroyed_value: 'destroyedValue',
  npc_bounties: 'npcBounties',
  loyalty_points: 'loyaltyPoints',
  trade_value: 'tradeValue',
};

async function importMonth(zipUrl: string, month: string): Promise<number> {
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`MER download failed [${res.status}]: ${zipUrl}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  // Extract only the regional stats chart
  const files = unzipSync(buf, { filter: (f) => f.name.endsWith('1_regional_stats.html') });
  const entry = Object.values(files)[0];
  if (!entry) throw new Error(`1_regional_stats.html missing from ${zipUrl}`);
  const html = new TextDecoder().decode(entry);

  const traces = extractPlotlyData(html);
  const regions = new Map<string, Record<string, number>>();
  for (const trace of traces) {
    const field = METRIC_FIELDS[trace.name];
    if (!field || !Array.isArray(trace.x) || !Array.isArray(trace.y)) continue;
    trace.y.forEach((region, i) => {
      const row = regions.get(region) ?? {};
      row[field] = Number(trace.x[i]) || 0;
      regions.set(region, row);
    });
  }

  let count = 0;
  for (const [region, metrics] of regions) {
    await db.sectorReport.upsert({
      where: { month_region: { month, region } },
      create: {
        month,
        region,
        minedValue: metrics.minedValue ?? 0,
        producedValue: metrics.producedValue ?? 0,
        destroyedValue: metrics.destroyedValue ?? 0,
        npcBounties: metrics.npcBounties ?? 0,
        loyaltyPoints: metrics.loyaltyPoints ?? 0,
        tradeValue: metrics.tradeValue ?? 0,
      },
      update: {
        minedValue: metrics.minedValue ?? 0,
        producedValue: metrics.producedValue ?? 0,
        destroyedValue: metrics.destroyedValue ?? 0,
        npcBounties: metrics.npcBounties ?? 0,
        loyaltyPoints: metrics.loyaltyPoints ?? 0,
        tradeValue: metrics.tradeValue ?? 0,
      },
    });
    count++;
  }
  return count;
}

/**
 * Ensure the two most recent published MER months are imported.
 * Throttled to one archive check per day unless `force` is set.
 */
export async function refreshSectorReports(force = false): Promise<{ imported: string[]; skipped: boolean; error?: string }> {
  if (!force) {
    const lastCheck = await db.bankConfig.findUnique({ where: { key: 'mer_last_check' } });
    if (lastCheck && Date.now() - new Date(lastCheck.value).getTime() < CHECK_INTERVAL_MS) {
      return { imported: [], skipped: true };
    }
  }

  const year = new Date().getFullYear();
  const urls = [...(await listZipUrls(year - 1)), ...(await listZipUrls(year))].sort();
  const latestTwo = urls.slice(-2);

  const imported: string[] = [];
  let error: string | undefined;
  for (const url of latestTwo) {
    const month = monthFromUrl(url);
    if (!month) continue;
    const existing = await db.sectorReport.count({ where: { month } });
    if (existing > 0) continue;
    try {
      await importMonth(url, month);
      imported.push(month);
    } catch (err) {
      error = String(err instanceof Error ? err.message : err);
    }
  }

  await db.bankConfig.upsert({
    where: { key: 'mer_last_check' },
    create: { key: 'mer_last_check', value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });

  return { imported, skipped: false, error };
}

// ── Reads ────────────────────────────────────────────────────

export interface SectorSummary {
  region: string;
  month: string;
  minedValue: number;
  producedValue: number;
  destroyedValue: number;
  npcBounties: number;
  loyaltyPoints: number;
  tradeValue: number;
  totalActivity: number;      // sum of all value flows
  momGrowthPct: number | null; // total activity vs previous month
}

/**
 * Latest month's sector reports with month-over-month growth,
 * sorted by total economic activity.
 */
export async function getSectorReports(): Promise<{ month: string | null; sectors: SectorSummary[] }> {
  const latest = await db.sectorReport.findFirst({ orderBy: { month: 'desc' }, select: { month: true } });
  if (!latest) return { month: null, sectors: [] };

  const months = await db.sectorReport.findMany({
    select: { month: true },
    distinct: ['month'],
    orderBy: { month: 'desc' },
    take: 2,
  });
  const prevMonth = months.length > 1 ? months[1].month : null;

  const [current, previous] = await Promise.all([
    db.sectorReport.findMany({ where: { month: latest.month } }),
    prevMonth ? db.sectorReport.findMany({ where: { month: prevMonth } }) : Promise.resolve([]),
  ]);

  const total = (r: { minedValue: number; producedValue: number; destroyedValue: number; npcBounties: number; loyaltyPoints: number; tradeValue: number }) =>
    r.minedValue + r.producedValue + r.destroyedValue + r.npcBounties + r.loyaltyPoints + r.tradeValue;

  const prevTotals = new Map(previous.map((r) => [r.region, total(r)]));

  const sectors = current
    .map((r) => {
      const totalActivity = total(r);
      const prev = prevTotals.get(r.region);
      return {
        region: r.region,
        month: r.month,
        minedValue: r.minedValue,
        producedValue: r.producedValue,
        destroyedValue: r.destroyedValue,
        npcBounties: r.npcBounties,
        loyaltyPoints: r.loyaltyPoints,
        tradeValue: r.tradeValue,
        totalActivity,
        momGrowthPct: prev && prev > 0 ? (totalActivity - prev) / prev : null,
      };
    })
    .sort((a, b) => b.totalActivity - a.totalActivity);

  return { month: latest.month, sectors };
}
