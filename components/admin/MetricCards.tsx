export function MetricCards({ metrics }: { metrics: { participants: number; moments: number; published: number; hidden: number } }) {
  return <div className="admin-metrics">{[['Peserta', metrics.participants], ['Momen', metrics.moments], ['Published', metrics.published], ['Hidden', metrics.hidden]].map(([label, value]) => <article className="admin-metric" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}
