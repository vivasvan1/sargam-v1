import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import { fetchNotebookFromRegistry, extractNotebookMeta } from './_utils';

let cachedHtml: string | null = null;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function getBaseHtml(req: VercelRequest): Promise<string> {
  if (cachedHtml) return cachedHtml;

  // 1. Check dist/index.html
  const distPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(distPath)) {
    try {
      cachedHtml = fs.readFileSync(distPath, 'utf-8');
      return cachedHtml;
    } catch {}
  }

  // 2. Check root index.html
  const rootPath = path.join(process.cwd(), 'index.html');
  if (fs.existsSync(rootPath)) {
    try {
      cachedHtml = fs.readFileSync(rootPath, 'utf-8');
      return cachedHtml;
    } catch {}
  }

  // 3. Fallback fetch from origin
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'sargam.speede.site';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  try {
    const res = await fetch(`${proto}://${host}/index.html`);
    if (res.ok) {
      cachedHtml = await res.text();
      return cachedHtml;
    }
  } catch {}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fileId = (req.query.fileId as string) || '';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'sargam.speede.site';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    let title = 'Speede Sargam Notebook';
    let raag = '';
    let description =
      'Indian classical music notation notebook. Open to play, edit, and practice interactive swara visualizer.';
    let imageUrl = `${baseUrl}/notebook_preview.jpg`;
    let canonicalUrl = `${baseUrl}/`;

    if (fileId) {
      canonicalUrl = `${baseUrl}/?fileId=${encodeURIComponent(fileId)}`;
      imageUrl = `${baseUrl}/api/og?fileId=${encodeURIComponent(fileId)}`;

      try {
        const data = await fetchNotebookFromRegistry(fileId);
        const meta = extractNotebookMeta(data.notebook, data.entry);
        title = meta.title;
        raag = meta.raag;
        description = meta.description;
      } catch (err) {
        console.warn(`Could not load registry info for ${fileId}:`, err);
      }
    }

    const baseHtml = await getBaseHtml(req);

    const pageTitle = raag && !title.toLowerCase().includes(raag.toLowerCase())
      ? `${raag} - ${title} | Speede Sargam`
      : `${title} | Speede Sargam`;

    const escapedTitle = escapeHtml(pageTitle);
    const escapedOgTitle = escapeHtml(raag ? `${raag} • ${title}` : title);
    const escapedDesc = escapeHtml(description);
    const escapedImg = escapeHtml(imageUrl);
    const escapedUrl = escapeHtml(canonicalUrl);

    // Replace <title>
    let html = baseHtml.replace(/<title>.*?<\/title>/i, `<title>${escapedTitle}</title>`);

    // Injected Open Graph and Twitter Card tags
    const metaTags = `
    <!-- Dynamic Open Graph / WhatsApp / Instagram / Facebook -->
    <meta property="og:type" content="music.song" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:title" content="${escapedOgTitle}" />
    <meta property="og:description" content="${escapedDesc}" />
    <meta property="og:image" content="${escapedImg}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapedOgTitle}" />
    <meta property="og:site_name" content="Speede Sargam Notebook" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapedUrl}" />
    <meta name="twitter:title" content="${escapedOgTitle}" />
    <meta name="twitter:description" content="${escapedDesc}" />
    <meta name="twitter:image" content="${escapedImg}" />
    <meta name="description" content="${escapedDesc}" />
`;

    if (html.includes('</head>')) {
      html = html.replace('</head>', `${metaTags}\n</head>`);
    } else {
      html = metaTags + html;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    res.status(200).send(html);
  } catch (error: any) {
    console.error('Error in share handler:', error);
    const fallbackHtml = await getBaseHtml(req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(fallbackHtml);
  }
}
