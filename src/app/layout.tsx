import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EVE Auto Bank — PLEX-Secured Lending',
  description: 'Automated PLEX-secured lending system for EVE Online pilots',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">{children}</main>
            <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
              EVE Auto Bank &mdash; Not affiliated with CCP Games &bull; ISK lending involves risk
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
