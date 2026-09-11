export function LiveActivity({ activity }: { activity: Array<{ id: string; at: string; label: string }> }) {
  return <section className="admin-panel"><h2>Aktivitas live</h2>{activity.length ? <ul className="admin-activity">{activity.map((item) => <li key={item.id}><time>{new Date(item.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</time><span>{item.label}</span></li>)}</ul> : <p className="muted-copy">Belum ada aktivitas.</p>}</section>;
}
