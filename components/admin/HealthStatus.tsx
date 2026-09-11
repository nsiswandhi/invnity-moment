export function HealthStatus({ health }: { health: { overall: string; checks: Array<{ component: string; label: string; status: string; latencyMs: number }> } | null }) {
  if (!health) return <section className="admin-panel"><h2>Status layanan</h2><p className="muted-copy">Status belum tersedia.</p></section>;
  return <section className="admin-panel"><h2>Status layanan <span className={`health-badge health-${health.overall}`}>{health.overall}</span></h2><div className="health-list">{health.checks.map((check) => <div key={check.component}><span>{check.label}</span><span>{check.status} · {check.latencyMs} ms</span></div>)}</div></section>;
}
