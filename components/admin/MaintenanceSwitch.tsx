'use client';
export function MaintenanceSwitch({ mode, onChange, busy = false }: { mode: string; onChange: (mode: 'live' | 'maintenance' | 'archived') => void; busy?: boolean }) {
  return <section className="admin-panel"><h2>Mode acara</h2><p className="muted-copy">Mode maintenance menghentikan registrasi dan upload baru.</p><div className="admin-mode-row">{(['live', 'maintenance', 'archived'] as const).map((value) => <button key={value} className={mode === value ? 'primary-button' : 'secondary-button'} type="button" disabled={busy || mode === value} onClick={() => onChange(value)}>{value === 'live' ? 'Live' : value === 'maintenance' ? 'Aktifkan maintenance' : 'Arsipkan'}</button>)}</div>{mode === 'maintenance' && <p className="success-message">Mode maintenance aktif.</p>}</section>;
}
