import { ImageResponse } from 'next/og';
import { getConfig } from '@/lib/config';

export const alt = 'Portfolio — public repository index';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Rendered dynamically on each request because it depends on environment
 * configuration (GITHUB_USERNAME). This prevents build-time failures when
 * environment variables are not available during the build process.
 */
export const dynamic = 'force-dynamic';

/**
 * Social preview generated from configuration, so it always states the real name
 * and handle. No binary asset to keep in sync, no third-party image service.
 * Node runtime (default) because it reads the server-side config.
 */
export default async function OpengraphImage() {
  const config = getConfig();
  const { profile, site } = config;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0b0d10',
          color: '#edf0f3',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: '#ffb373',
              color: '#1a1206',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 600 }}>{profile.displayName}</span>
            <span style={{ fontSize: 18, color: '#a0a9b4' }}>github.com/{profile.username}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ width: 96, height: 6, backgroundColor: '#ffb373', borderRadius: 3 }} />
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
            {site.name}
          </div>
          <div style={{ fontSize: 28, color: '#a0a9b4', maxWidth: 900, lineHeight: 1.35 }}>
            {site.description}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#6f7883' }}>
          <span>Public repositories, read live from the GitHub API</span>
          <span>{new URL(site.url).host}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
