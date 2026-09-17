import Link from 'next/link';

type EventHeaderProps = { activePage: 'moments' | 'album' };

export function EventHeader({ activePage }: EventHeaderProps) {
  return (
    <header className="page-header">
      <div className="event-branding">
        <Link className="brand-mark event-header-logo" href="/moments">
          <img src="/brand/invnity-logo.png" alt="InVnity" />
        </Link>
        <div className="event-details">
          <strong>Reuni Akbar IA 5 Bandung</strong>
          <span>10 Oktober 2026</span>
        </div>
      </div>
      <nav className="header-links" aria-label="Navigasi momen">
        <Link href="/moments" className={activePage === 'moments' ? 'active' : undefined} aria-current={activePage === 'moments' ? 'page' : undefined}>Momen saya</Link>
        <Link href="/album" className={activePage === 'album' ? 'active' : undefined} aria-current={activePage === 'album' ? 'page' : undefined}>Album reuni</Link>
      </nav>
    </header>
  );
}
