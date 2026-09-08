import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fazoo Admin',
  description: 'Field-force management portal',
};

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:text-white focus:outline-none"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
