import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'InVnity Moments', description: 'Momen berharga, tersimpan selamanya.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
