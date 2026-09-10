import Link from 'next/link';

export function AlbumHeader({ archived = false }: { archived?: boolean }) {
  return <header className="album-header"><div><Link className="brand-mark" href="/">InV<span>n</span>ity</Link><p className="eyebrow">ALBUM REUNI</p><h1>Ribuan cerita,<br /><span>satu kenangan.</span></h1><p className="intro-copy">Lihat momen yang dibagikan bersama teman-teman IA 5.</p></div>{archived && <p className="archive-note" role="status">Album kenangan ini tetap bisa dibuka kapan saja.</p>}</header>;
}
