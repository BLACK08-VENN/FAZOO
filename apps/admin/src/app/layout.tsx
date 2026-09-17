import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fazoo Admin',
  description: 'Field-force management portal',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fazoo',
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#6B21A8',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){var reloading=false;navigator.serviceWorker.addEventListener('controllerchange',function(){if(!reloading){reloading=true;window.location.reload()}});window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js?v=4',{updateViaCache:'none'}).then(function(reg){reg.update()}).catch(function(){})})}`,
          }}
        />
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
