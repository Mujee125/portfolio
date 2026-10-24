import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getConfig } from '@/lib/config';
import { getInventoryService } from '@/lib/github';
import { THEME_COOKIE, resolveTheme } from '@/lib/theme';
import { ClientReady } from '@/components/layout/ClientReady';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const config = getConfig();
  const title = `${config.profile.displayName} · ${config.site.name}`;

  return {
    metadataBase: new URL(config.site.url),
    title: { default: title, template: `%s · ${config.site.name}` },
    description: config.site.description,
    applicationName: config.site.name,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: config.site.name,
      title,
      description: config.site.description,
      url: '/',
      locale: 'en_GB',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: config.site.description,
    },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getConfig();
  const cookieStore = await cookies();
  const theme = resolveTheme(cookieStore.get(THEME_COOKIE)?.value);
  const snapshot = getInventoryService().peek();

  return (
    <html lang="en" {...(theme === 'system' ? {} : { 'data-theme': theme })}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-br-lg bg-accent px-4 py-2 font-semibold text-accent-ink focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50"
        >
          Skip to content
        </a>
        <ClientReady />
        <SiteHeader config={config} theme={theme} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter config={config} cacheAgeSeconds={snapshot?.ageSeconds ?? null} />
      </body>
    </html>
  );
}
