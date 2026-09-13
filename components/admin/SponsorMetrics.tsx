import React from 'react';
import type { SponsorSummary } from '../../lib/analytics/aggregates';

export function SponsorMetrics({ summary }: { summary: SponsorSummary }) {
  return <section className="admin-panel sponsor-metrics"><h2>Lima Circle</h2><p className="muted-copy">Interaksi menuju Google Play, terbatas pada tampilan dan klik tautan.</p><div className="sponsor-metric-grid"><div><span>Tampilan</span><strong>{summary.views}</strong></div><div><span>Klik</span><strong>{summary.clicks}</strong></div><div><span>CTR</span><strong>{summary.ctr}%</strong></div></div></section>;
}
