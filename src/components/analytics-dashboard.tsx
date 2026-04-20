'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface AnalyticsData {
  loanVolume: { month: string; loans: number }[];
  revenue: { month: string; isk: number }[];
  statusDist: { status: string; count: number }[];
  ltvBuckets: { range: string; count: number }[];
  trustTiers: { tier: string; count: number }[];
  creditScoreDist: { label: string; count: number }[];
  plexHistory: { date: string; price: number }[];
  kpis: {
    activeExposure: number;
    totalInterestEarned: number;
    totalPlexHeld: number;
    avgLtv: number;
    defaultRate: number;
    insuranceRate: number;
    totalBorrowers: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  APPROVED: '#60a5fa',
  ACTIVE: '#4ade80',
  OVERDUE: '#fb923c',
  DEFAULTED: '#f87171',
  COMPLETED: '#a3e635',
  CANCELLED: '#64748b',
};

const TIER_COLORS: Record<string, string> = {
  BASIC: '#64748b',
  STANDARD: '#60a5fa',
  ADVANCED: '#a78bfa',
  PREMIUM: '#f59e0b',
};

function formatISK(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

function formatMonth(m: string) {
  const [year, month] = m.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="eve-card text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

const chartTooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#e2e8f0',
  fontSize: '12px',
};

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load analytics');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="eve-card flex items-center justify-center py-16 text-slate-400 text-sm">
        Loading analytics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="eve-card flex items-center justify-center py-10 text-red-400 text-sm">
        {error ?? 'No data available'}
      </div>
    );
  }

  const { kpis } = data;
  const hasPlexHistory = data.plexHistory.length > 1;

  return (
    <div className="space-y-8">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPI label="Active Exposure" value={`${formatISK(kpis.activeExposure)} ISK`} />
        <KPI label="Interest Earned" value={`${formatISK(kpis.totalInterestEarned)} ISK`} />
        <KPI label="PLEX in Vault" value={`${kpis.totalPlexHeld.toLocaleString()}`} sub="PLEX" />
        <KPI label="Avg LTV" value={`${kpis.avgLtv}%`} />
        <KPI label="Default Rate" value={`${kpis.defaultRate}%`} />
        <KPI label="Insurance Uptake" value={`${kpis.insuranceRate}%`} />
        <KPI label="Total Borrowers" value={`${kpis.totalBorrowers}`} />
      </div>

      {/* Loan Volume + Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Loan Volume (6 months)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.loanVolume.map((d) => ({ ...d, month: formatMonth(d.month) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="loans" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Loans" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Interest Revenue (6 months)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.revenue.map((d) => ({ ...d, month: formatMonth(d.month) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatISK(v)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`${formatISK(v)} ISK`, 'Revenue']} />
              <Bar dataKey="isk" fill="#4ade80" radius={[3, 3, 0, 0]} name="ISK" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PLEX Price History */}
      {hasPlexHistory && (
        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">PLEX Price History</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.plexHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(v: number) => [`${formatISK(v)} ISK`, 'PLEX Price']}
              />
              <Line type="monotone" dataKey="price" stroke="#60a5fa" dot={false} strokeWidth={2} name="PLEX" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Status dist + LTV dist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Portfolio by Status</h3>
          {data.statusDist.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">No loans yet</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie
                    data={data.statusDist}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data.statusDist.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {data.statusDist.map((s) => (
                  <div key={s.status} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.status] ?? '#64748b' }} />
                      <span className="text-slate-400">{s.status}</span>
                    </div>
                    <span className="text-white font-medium">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">LTV Distribution</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.ltvBuckets} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis dataKey="range" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={55} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" fill="#a78bfa" radius={[0, 3, 3, 0]} name="Loans" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trust Tiers + Credit Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Borrowers by Trust Tier</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.trustTiers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="tier" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" name="Borrowers" radius={[3, 3, 0, 0]}>
                {data.trustTiers.map((entry) => (
                  <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="eve-card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Credit Score Distribution</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.creditScoreDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" fill="#f59e0b" name="Borrowers" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
