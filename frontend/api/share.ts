import fs from 'node:fs';
import path from 'node:path';
import { fetchNotebookFromRegistry, extractNotebookMeta } from './_utils.js';

let cachedHtml: string | null = null;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function getBaseHtml(origin: string): Promise<string> {
  if (cachedHtml) return cachedHtml;

  // 1. Try local dist/index.html
  try {
    const distPath = path.join(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distPath)) {
      cachedHtml = fs.readFileSync(distPath, 'utf-8');
      return cachedHtml;
    }
  } catch {}

  // 2. Fallback fetch from origin
  try {
    const res = await fetch(`${origin}/index.html`);
    if (res.ok) {
      cachedHtml = await res.text();
      return cachedHtml;
    }
  } catch (err) {
    console.warn('Could not fetch base index.html from origin:', err);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Speede Sargam Notebook</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId') || '';
    const origin = url.origin;

    let title = 'Speede Sargam Notebook';
    let raag = '';
    let description =
      'Indian classical music notation notebook. Open to play, edit, and practice interactive swara visualizer.';
    let imageUrl = `${origin}/notebook_preview.jpg`;
    let canonicalUrl = `${origin}/`;

    if (fileId) {
      canonicalUrl = `${origin}/?fileId=${encodeURIComponent(fileId)}`;
      imageUrl = `${origin}/api/og?fileId=${encodeURIComponent(fileId)}`;

      try {
        const data = await fetchNotebookFromRegistry(fileId);
        const meta = extractNotebookMeta(data.notebook, data.entry);
        title = meta.title;
        raag = meta.raag;
        description = meta.description;
      } catch (err) {
        console.warn(`Could not load registry info for fileId ${fileId}:`, err);
      }
    }

    const baseHtml = await getBaseHtml(origin);

    // Desired title format: e.g. "Raag Yaman - Sargam Notebook"
    const displayTitle = raag && raag !== 'Indian Classical Music'
      ? `${raag} - Sargam Notebook`
      : title.toLowerCase().includes('sargam')
        ? title
        : `${title} - Sargam Notebook`;

    const escapedTitle = escapeHtml(displayTitle);
    const escapedDesc = escapeHtml(description);
    const escapedImg = escapeHtml(imageUrl);
    const escapedUrl = escapeHtml(canonicalUrl);

    // Strip any pre-existing og: and twitter: meta tags to prevent duplicates
    let html = baseHtml
      .replace(/<title>.*?<\/title>/i, `<title>${escapedTitle}</title>`)
      .replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '')
      .replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, '');

    const metaTags = `
    <!-- Dynamic Open Graph / WhatsApp / Instagram / Facebook -->
    <meta property="og:type" content="music.song" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDesc}" />
    <meta property="og:image" content="${escapedImg}" />
    <meta property="og:image:secure_url" content="${escapedImg}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapedTitle}" />
    <meta property="og:site_name" content="Speede Sargam Notebook" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapedUrl}" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDesc}" />
    <meta name="twitter:image" content="${escapedImg}" />
    <meta name="description" content="${escapedDesc}" />
`;

    if (html.includes('</head>')) {
      html = html.replace('</head>', `${metaTags}\n</head>`);
    } else {
      html = metaTags + html;
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    console.error('Error in share handler:', error);
    const fallbackHtml = `<!doctype html><html><head><title>Speede Sargam Notebook</title></head><body><div id="root"></div></body></html>`;
    return new Response(fallbackHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
