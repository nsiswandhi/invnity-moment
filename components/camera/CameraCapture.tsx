'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { trackClientEvent } from '../../lib/analytics/client-events';

export type CameraPermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
export type CameraCaptureProps = { onCapture: (blob: Blob) => void; onPermissionState: (state: CameraPermissionState) => void; onClose?: () => void };

export function CameraCapture({ onCapture, onPermissionState, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>('idle');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const report = useCallback((state: CameraPermissionState) => { setPermission(state); onPermissionState(state); trackClientEvent('permission_result', { permission: state }); }, [onPermissionState]);
  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; }, []);
  const openCamera = useCallback(async (requestedFacingMode = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) { report('unavailable'); return; }
    stop(); report('requesting'); trackClientEvent('camera_opened', { facingMode: requestedFacingMode });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: requestedFacingMode }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
      report('granted');
    } catch { report('denied'); }
  }, [facingMode, report, stop]);
  useEffect(() => () => stop(), [stop]);

  const switchCamera = () => { const next = facingMode === 'environment' ? 'user' : 'environment'; setFacingMode(next); void openCamera(next); };
  const capture = () => {
    const video = videoRef.current;
    if (!video || permission !== 'granted') return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => { if (blob) { trackClientEvent('capture'); onCapture(blob); } }, 'image/jpeg', 0.9);
  };

  return (
    <section className="camera-panel" aria-labelledby="camera-title">
      <div className="camera-topbar"><button className="icon-button" type="button" onClick={onClose} aria-label="Tutup kamera">×</button><span id="camera-title">Ambil momen</span><span className="camera-quota">0 / 10</span></div>
      <div className="camera-view">
        <video ref={videoRef} autoPlay muted playsInline aria-label="Pratinjau kamera" />
        {permission === 'idle' && <div className="camera-message"><span className="camera-symbol" aria-hidden="true">◉</span><h2>Siap mengabadikan?</h2><p>Kamera hanya aktif setelah kamu menekan tombol mulai.</p><button className="primary-button" type="button" onClick={() => void openCamera()}>Aktifkan kamera</button></div>}
        {permission === 'requesting' && <div className="camera-message"><p>Meminta izin kamera…</p></div>}
        {permission === 'denied' && <div className="camera-message"><h2>Kamera belum diizinkan</h2><p>Aktifkan izin kamera di pengaturan browser, lalu coba lagi.</p><button className="secondary-button" type="button" onClick={() => void openCamera()}>Coba lagi</button></div>}
        {permission === 'unavailable' && <div className="camera-message"><h2>Kamera tidak tersedia</h2><p>Buka halaman ini di browser yang mendukung kamera.</p></div>}
      </div>
      <div className="camera-controls"><button className="secondary-button" type="button" onClick={switchCamera} disabled={permission !== 'granted'}>↺ Ganti kamera</button><button className="shutter-button" type="button" onClick={capture} disabled={permission !== 'granted'} aria-label="Ambil foto"><span aria-hidden="true" /></button><span className="control-spacer" /></div>
    </section>
  );
}
