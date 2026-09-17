import { EventHeader } from '../brand/EventHeader';

export function AlbumHeader({ archived = false }: { archived?: boolean }) {
  return <><EventHeader activePage="album" /><header className="album-header"><div><p className="eyebrow">ALBUM REUNI</p><h1>Ribuan cerita,<br /><span>satu kenangan.</span></h1><p className="intro-copy">Lihat momen yang dibagikan bersama teman-teman IA 5.</p></div>{archived && <p className="archive-note" role="status">Album kenangan ini tetap bisa dibuka kapan saja.</p>}</header></>;
}
