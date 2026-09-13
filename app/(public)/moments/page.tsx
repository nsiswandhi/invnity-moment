'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CameraCapture } from '../../../components/camera/CameraCapture';
import { compressImage } from '../../../components/camera/image-compression';
import { PendingUploadQueue, type PendingUploadState } from '../../../components/camera/pending-upload-queue';
import { PhotoPreview } from '../../../components/camera/PhotoPreview';
import { CategoryCards } from '../../../components/moments/CategoryCards';
import { DeleteMomentDialog } from '../../../components/moments/DeleteMomentDialog';
import { MyMomentsGrid, type DisplayMoment } from '../../../components/moments/MyMomentsGrid';
import { trackClientEvent, trackClientEventOnce } from '../../../lib/analytics/client-events';
import { type CursorPage, type MomentCategory, type MomentRecord } from '../../../lib/db/types';
import { deleteOwnedMomentRequest, loadOwnedMoments, mergeOwnedMoments, updateOwnedMomentRequest } from '../../../lib/moments/personal-moments';
import { prepareImageForUpload } from '../../../lib/moments/upload-preparation';

type Participant = { id: string; eventId: string; name: string; batch: string };
type MePayload = { data?: { participant?: Participant; quota?: { activeMoments?: number; maxActiveMoments?: number } }; error?: { message?: string } };
type UploadPayload = { data?: { momentId: string; uploadUrl: string; headers?: Record<string, string> }; error?: { message?: string } };
const storageKey = (participantId: string) => `invnity-moments:${participantId}`;
const reservationId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const csrfToken = () => typeof document === 'undefined' ? '' : decodeURIComponent(document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('invnity_csrf='))?.split('=').slice(1).join('=') || '');
const emptyPage: CursorPage<DisplayMoment> = { data: [], nextCursor: null };

export default function MomentsPage() {
  const [participant, setParticipant] = useState<Participant | null>(null); const [quota, setQuota] = useState(10); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [page, setPage] = useState<CursorPage<DisplayMoment>>(emptyPage); const [screen, setScreen] = useState<'home' | 'camera' | 'preview' | 'category' | 'upload' | 'success'>('home'); const [photo, setPhoto] = useState<Blob | null>(null); const [category, setCategory] = useState<MomentCategory>(); const [uploadState, setUploadState] = useState<PendingUploadState>('ready'); const [uploadMessage, setUploadMessage] = useState(''); const [deleteTarget, setDeleteTarget] = useState<MomentRecord | null>(null);
  const queue = useMemo(() => new PendingUploadQueue({ maxItems: 10 }), []);
  const uploadIdRef = useRef<string | null>(null);

  const readSaved = useCallback((id: string) => { try { const saved = localStorage.getItem(storageKey(id)); return saved ? JSON.parse(saved) as DisplayMoment[] : []; } catch { return []; } }, []);
  const writeSaved = useCallback((id: string, moments: DisplayMoment[]) => { try { localStorage.setItem(storageKey(id), JSON.stringify(moments.map(({ thumbnailUrl: _thumbnailUrl, displayUrl: _displayUrl, ...moment }) => moment))); } catch { /* local cache is an enhancement, server remains authoritative */ } }, []);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const response = await fetch('/api/v1/me'); const payload = await response.json() as MePayload; if (!response.ok || !payload.data?.participant) throw new Error(payload.error?.message || 'Sesi kamu belum tersedia.'); if (!active) return; const me = payload.data.participant; setParticipant(me); setQuota(payload.data.quota?.maxActiveMoments || 10); const local = readSaved(me.id); const server = await loadOwnedMoments(fetch, null); if (active) setPage(mergeOwnedMoments(server, local)); trackClientEventOnce('my-moments-gallery', 'gallery_view', { source: 'moments' }); } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Sesi kamu belum tersedia.'); } finally { if (active) setLoading(false); } };
    void load(); return () => { active = false; };
  }, [readSaved]);

  const beginCapture = () => { if (page.data.length >= quota) return; setError(''); setScreen('camera'); };
  const onCapture = (blob: Blob) => { setPhoto(blob); setScreen('preview'); };
  const saveUpload = async (retry = false) => {
    if (!participant || !photo || !category) return; const id = uploadIdRef.current || reservationId(); uploadIdRef.current = id; setScreen('upload'); setUploadState(retry ? 'retrying' : 'ready'); setUploadMessage('Menyiapkan foto…');
    try {
      const compressed = await prepareImageForUpload(photo, compressImage);
      if (!retry) await queue.enqueue({ id, blob: compressed.blob }); else await queue.retry(id);
      await queue.markUploading(id); setUploadState('uploading'); setUploadMessage('Mengunggah foto langsung ke album…'); trackClientEvent('upload_started', { category });
      const reserveResponse = await fetch('/api/v1/moments/reserve', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ eventId: participant.eventId, contentType: compressed.mimeType, reservationId: id }) });
      const reservePayload = await reserveResponse.json() as UploadPayload; if (!reserveResponse.ok || !reservePayload.data) throw new Error(reservePayload.error?.message || 'Slot momen belum tersedia.');
      const uploadResponse = await fetch(reservePayload.data.uploadUrl, { method: 'PUT', headers: reservePayload.data.headers || { 'content-type': compressed.mimeType }, body: compressed.blob }); if (!uploadResponse.ok) throw new Error('Foto belum berhasil diunggah.');
      const completeResponse = await fetch(`/api/v1/moments/${reservePayload.data.momentId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ category }) }); const completePayload = await completeResponse.json() as { data?: { moment?: MomentRecord }; error?: { message?: string } }; if (!completeResponse.ok || !completePayload.data?.moment) throw new Error(completePayload.error?.message || 'Foto belum tersimpan.');
      const moment = completePayload.data.moment as DisplayMoment; await queue.markSaved(id); await queue.remove(id); const next = [moment, ...page.data]; setPage({ data: next, nextCursor: null }); writeSaved(participant.id, next); setUploadState('saved'); setUploadMessage('Momenmu sudah tersimpan!'); trackClientEvent('upload_succeeded', { category }); trackClientEvent('moment_published', { category }); setScreen('success');
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Upload gagal. Foto tetap tersimpan di perangkat ini.'; await queue.markRetrying(id, message).catch(() => undefined); await queue.markFailed(id, message).catch(() => undefined); setUploadState('failed'); setUploadMessage(message); trackClientEvent('upload_failed', { reason: 'network_or_server' }); }
  };
  const retryUpload = () => { trackClientEvent('upload_retried', { retryCount: queue.get(uploadIdRef.current || '')?.retries || 0 }); void saveUpload(true); };
  const updateCategory = async (moment: MomentRecord, nextCategory: MomentCategory) => { if (!participant) return; try { const saved = await updateOwnedMomentRequest(fetch, moment.id, nextCategory, csrfToken()); const next = page.data.map((item) => item.id === moment.id ? { ...item, ...saved } : item); setPage({ data: next, nextCursor: page.nextCursor }); writeSaved(participant.id, next); } catch (reason) { setUploadMessage(reason instanceof Error ? reason.message : 'Kategori belum dapat disimpan.'); } };
  const deleteMoment = async (moment: MomentRecord) => { if (!participant) return; try { await deleteOwnedMomentRequest(fetch, moment.id, csrfToken()); const next = page.data.filter((item) => item.id !== moment.id); setPage({ data: next, nextCursor: page.nextCursor }); writeSaved(participant.id, next); setDeleteTarget(null); setUploadMessage('Satu slot kembali tersedia. Kamu bisa mengambil momen baru.'); trackClientEvent('moment_deleted'); } catch (reason) { setUploadMessage(reason instanceof Error ? reason.message : 'Foto belum dapat dihapus.'); } };
  const loadMore = async () => { if (!page.nextCursor) return; try { const next = await loadOwnedMoments(fetch, page.nextCursor); setPage(mergeOwnedMoments(next, page.data)); } catch (reason) { setUploadMessage(reason instanceof Error ? reason.message : 'Momen berikutnya belum dapat dimuat.'); } };

  if (loading) return <main className="site-shell loading-shell"><p>Menyiapkan momenmu…</p></main>;
  if (error && !participant) return <main className="site-shell form-shell"><section className="form-card"><p className="eyebrow">Momen saya</p><h1>Masuk dulu, yuk.</h1><p className="intro-copy">{error}</p><Link className="primary-button" href="/register">Daftar / masuk kembali</Link><Link className="text-link" href="/recovery">Pulihkan akses dengan email</Link></section></main>;
  if (!participant) return null;
  if (screen === 'camera') return <main className="site-shell camera-shell"><CameraCapture onCapture={onCapture} onPermissionState={() => undefined} onClose={() => setScreen('home')} /></main>;
  if (screen === 'preview' && photo) return <main className="site-shell"><PhotoPreview blob={photo} onRetake={() => setScreen('camera')} onSave={() => setScreen('category')} /></main>;
  if (screen === 'category' && photo) return <main className="site-shell form-shell"><Link className="back-link" href="#" onClick={(event) => { event.preventDefault(); setScreen('preview'); }}>← Kembali ke foto</Link><section className="form-card"><p className="eyebrow">Satu langkah lagi</p><h1>Kasih nama suasananya.</h1><CategoryCards activeCount={page.data.length} selectedCategory={category} onSelect={(selected) => { setCategory(selected); trackClientEvent('category_selected', { category: selected }); }} /><button className="primary-button full-button" type="button" disabled={!category} onClick={() => void saveUpload()}>Simpan ke album →</button></section></main>;
  if (screen === 'upload') return <main className="site-shell status-shell"><section className="status-card" data-upload-state={uploadState}><div className="status-orb" aria-hidden="true">{uploadState === 'saved' ? '✓' : '↑'}</div><p className="eyebrow" data-testid="upload-status">{uploadState === 'ready' ? 'Siap diunggah' : uploadState === 'uploading' ? 'Sedang mengunggah' : uploadState === 'retrying' ? 'Mencoba lagi' : uploadState === 'saved' ? 'Tersimpan' : 'Gagal menyimpan'}</p><h1>{uploadMessage}</h1><p className="muted-copy">Foto tetap tersimpan di perangkat sampai server mengonfirmasi penyimpanan.</p><div className="progress-track"><span className={`progress-fill progress-${uploadState}`} /></div>{uploadState === 'failed' && queue.canRetry(uploadIdRef.current || '') && <button className="secondary-button" type="button" onClick={retryUpload}>Coba lagi</button>}</section></main>;
  if (screen === 'success') return <main className="site-shell status-shell"><section className="status-card"><div className="status-orb success-orb" aria-hidden="true">✓</div><p className="eyebrow">Tersimpan di Momen Saya</p><h1>{uploadMessage}</h1><p className="intro-copy">Momenmu ikut menjadi bagian dari cerita reuni.</p><div className="action-row"><button className="secondary-button" type="button" onClick={() => { setPhoto(null); setCategory(undefined); setScreen('home'); }}>Lihat momen saya</button><button className="primary-button" type="button" onClick={() => { setPhoto(null); setCategory(undefined); setScreen('camera'); }}>Ambil momen lagi</button></div></section></main>;
  return <main className="site-shell moments-shell"><header className="page-header"><Link className="brand-mark" href="/">InV<span>n</span>ity</Link><Link className="text-link" href="/recovery">Akses kembali</Link></header><section className="moments-hero"><p className="eyebrow">MOMEN SAYA</p><h1>Hai, {participant.name.split(' ')[0]}!</h1><p className="intro-copy">Simpan cerita reuni yang paling berarti buatmu.</p><div className="quota-badge"><strong>{page.data.length} / {quota}</strong><span>momen tersimpan</span></div><button className="primary-button capture-cta" type="button" onClick={beginCapture} disabled={page.data.length >= quota}>+ Ambil momen</button>{page.data.length >= quota && <p className="muted-copy">Kuota penuh. Hapus satu foto untuk mengembalikan slot.</p>}</section><MyMomentsGrid page={page} onDelete={setDeleteTarget} onCategoryChange={updateCategory} onLoadMore={() => void loadMore()} /><DeleteMomentDialog moment={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={(moment) => void deleteMoment(moment)} />{uploadMessage && <p className="slot-message" role="status">{uploadMessage}</p>}<nav className="bottom-nav" aria-label="Navigasi utama"><Link className="active" href="/moments">Momen saya</Link><Link href="/album">Album reuni</Link></nav></main>;
}
