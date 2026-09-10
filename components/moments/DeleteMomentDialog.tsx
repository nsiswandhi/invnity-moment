'use client';

import React from 'react';
import type { MomentRecord } from '../../lib/db/types';

export function DeleteMomentDialog({ moment, onCancel, onConfirm }: { moment: MomentRecord | null; onCancel: () => void; onConfirm: (moment: MomentRecord) => void }) {
  if (!moment) return null;
  return (
    <div className="dialog-backdrop"><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <h2 id="delete-title">Hapus foto ini?</h2><p>Foto akan dihapus dari momenmu. Satu slot akan kembali tersedia untuk foto baru.</p>
      <div className="action-row"><button className="secondary-button" type="button" onClick={onCancel}>Batal</button><button className="danger-button" type="button" onClick={() => onConfirm(moment)}>Hapus foto</button></div>
    </section></div>
  );
}
