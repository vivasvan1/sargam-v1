import fs from 'node:fs';
import path from 'node:path';

const REGISTRY_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwCoJsK1v5HDQI1CTz2QS514SDIJ8edxBsYfyYgXSYwqgHPAw7HCeoYpkwQLfApUbOi/exec';

interface MusicSection {
  title: string;
  notes: string[];
}

interface ExtractedMeta {
  title: string;
  author: string;
  raag: string;
  thaat: string;
  vadi: string;
  samvadi: string;
  time: string;
  tala: string;
  sa: string;
  tempo: string;
  cellTitle: string;
  sections: MusicSection[];
  description: string;
}

async function fetchNotebookFromRegistry(fileId: string): Promise<any> {
  const url = `${REGISTRY_SCRIPT_URL}?action=open&id=${encodeURIComponent(fileId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch notebook registry: ${response.status}`);
  }
  const data = await response.json();
  if (data.status === 'not_found' || !data.notebook) {
    throw new Error('Notebook not found in registry');
  }
  return data;
}

function extractNotebookMeta(notebook: any, entry: any = {}, targetCellId?: string): ExtractedMeta {
  const cells: any[] = notebook?.cells || [];
  const nbMetadata = notebook?.metadata || {};

  const title = (entry?.name || nbMetadata?.title || 'Indian Classical Music Notebook').trim();
  const author = (entry?.author || nbMetadata?.author || '').trim();

  // 1. Extract Raag Name (prioritize markdown heading # Raag <Name>)
  let raag = '';
  for (const c of cells) {
    if (c.cell_type === 'markdown') {
      const text = Array.isArray(c.source) ? c.source.join('\n') : (c.source || '');
      const match = text.match(/#\s*(Raag\s+[A-Za-z]+(?:\s+[A-Za-z]+)?|[A-Za-z]+(?:\s+[A-Za-z]+)?\s+Raag)/i);
      if (match) {
        raag = match[1].trim();
        break;
      }
    }
  }

  // Check title for Raag
  if (!raag && title) {
    const match = title.match(/Raag\s+[A-Za-z]+(?:\s+[A-Za-z]+)?/i);
    if (match) {
      raag = match[0].trim();
    }
  }

  // Check @raga directive in music cells
  if (!raag) {
    for (const c of cells) {
      if (c.cell_type === 'music') {
        const text = Array.isArray(c.source) ? c.source.join('\n') : (c.source || '');
        const match = text.match(/@raga\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
        if (match) {
          raag = `Raag ${match[1].trim()}`;
          break;
        }
      }
    }
  }

  // 2. Extract Classical Attributes (Thaat, Vadi, Samvadi, Time)
  let thaat = '';
  let vadi = '';
  let samvadi = '';
  let time = '';

  for (const c of cells) {
    if (c.cell_type === 'markdown') {
      const text = Array.isArray(c.source) ? c.source.join('\n') : (c.source || '');
      const thaatMatch = text.match(/\*\*Thaat:\*\*\s*([^\n\r*]+)/i);
      const vadiMatch = text.match(/\*\*Vadi:\*\*\s*([^\n\r*]+)/i);
      const samvadiMatch = text.match(/\*\*Samvadi:\*\*\s*([^\n\r*]+)/i);
      const timeMatch = text.match(/\*\*Time:\*\*\s*([^\n\r*]+)/i);

      if (thaatMatch && !thaat) thaat = thaatMatch[1].trim();
      if (vadiMatch && !vadi) vadi = vadiMatch[1].trim();
      if (samvadiMatch && !samvadi) samvadi = samvadiMatch[1].trim();
      if (timeMatch && !time) time = timeMatch[1].trim();
    }
  }

  // 3. Find target cell or first music cell
  let targetCell = targetCellId ? cells.find((c: any) => c.id === targetCellId) : null;
  if (!targetCell) {
    targetCell = cells.find((c: any) => c.cell_type === 'music');
  }

  let tala = '';
  let sa = '';
  let tempo = '';
  let cellTitle = '';
  const sections: MusicSection[] = [];

  // Scan music cells for default tala/sa/tempo
  for (const c of cells) {
    if (c.cell_type === 'music') {
      const lines: string[] = Array.isArray(c.source) ? c.source : (c.source || '').split('\n');
      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if ((trimmed.startsWith('@tala ') || trimmed.startsWith('@taal ')) && !tala) {
          tala = trimmed.replace(/^@(tala|taal)\s+/, '').trim();
        } else if (trimmed.startsWith('@sa ') && !sa) {
          sa = trimmed.slice(4).trim();
        } else if (trimmed.startsWith('@tempo ') && !tempo) {
          tempo = trimmed.slice(7).trim();
        }
      }
    }
  }

  if (targetCell) {
    const lines: string[] = Array.isArray(targetCell.source)
      ? targetCell.source
      : (targetCell.source || '').split('\n');

    let currentSectionTitle = '';
    const sectionList: { title: string; lines: string[] }[] = [];
    let currentLines: string[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('@tala ') || trimmed.startsWith('@taal ')) {
        tala = trimmed.replace(/^@(tala|taal)\s+/, '').trim();
      } else if (trimmed.startsWith('@sa ')) {
        sa = trimmed.slice(4).trim();
      } else if (trimmed.startsWith('@tempo ')) {
        tempo = trimmed.slice(7).trim();
      } else if (trimmed.startsWith('@title ')) {
        cellTitle = trimmed.slice(7).trim();
      } else if (trimmed.startsWith('#') && !trimmed.startsWith('#voice')) {
        const headerTitle = trimmed.replace(/^#+\s*/, '').trim();
        if (!cellTitle) cellTitle = headerTitle;
        if (currentLines.length > 0) {
          sectionList.push({ title: currentSectionTitle || 'Section', lines: currentLines });
          currentLines = [];
        }
        currentSectionTitle = headerTitle;
      } else if (!trimmed.startsWith('@')) {
        currentLines.push(trimmed);
      }
    }

    if (currentLines.length > 0) {
      sectionList.push({ title: currentSectionTitle || 'Notation', lines: currentLines });
    }

    for (const sec of sectionList) {
      const combined = sec.lines.join(' ');
      const tokens = combined.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        sections.push({
          title: sec.title,
          notes: tokens.slice(0, 12),
        });
      }
    }
  }

  const descParts: string[] = [];
  if (raag) descParts.push(raag);
  if (cellTitle) descParts.push(cellTitle);
  if (thaat) descParts.push(`Thaat: ${thaat}`);
  if (vadi) descParts.push(`Vadi: ${vadi}`);
  if (samvadi) descParts.push(`Samvadi: ${samvadi}`);
  if (tala) descParts.push(`Tala: ${tala}`);
  if (sa) descParts.push(`Sa: ${sa}`);
  if (author) descParts.push(`By ${author}`);

  const description =
    descParts.length > 0
      ? `${descParts.join(' • ')} | Interactive Indian Classical Music Notebook`
      : 'Indian classical music notation notebook. Open to play, edit and practice interactive swara visualizer.';

  return {
    title,
    author,
    raag: raag || 'Indian Classical Music',
    thaat,
    vadi,
    samvadi,
    time,
    tala,
    sa,
    tempo,
    cellTitle,
    sections,
    description,
  };
}

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

export default async function handler(req: any, res: any) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'sargam.speede.site';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  try {
    let fileId = '';
    let cellId = '';

    if (req.query) {
      if (req.query.fileId) {
        fileId = Array.isArray(req.query.fileId) ? req.query.fileId[0] : req.query.fileId;
      }
      if (req.query.cellId) {
        cellId = Array.isArray(req.query.cellId) ? req.query.cellId[0] : req.query.cellId;
      }
    }

    if (!fileId && req.url) {
      try {
        const parsedUrl = new URL(req.url, origin);
        fileId = parsedUrl.searchParams.get('fileId') || '';
        if (!cellId) {
          cellId = parsedUrl.searchParams.get('cellId') || '';
        }
      } catch {}
    }

    let title = 'Speede Sargam Notebook';
    let raag = '';
    let cellTitle = '';
    let description =
      'Indian classical music notation notebook. Open to play, edit, and practice interactive swara visualizer.';
    let imageUrl = `${origin}/notebook_preview.jpg`;
    let canonicalUrl = `${origin}/`;

    if (fileId) {
      const cellParam = cellId ? `&cellId=${encodeURIComponent(cellId)}` : '';
      canonicalUrl = `${origin}/?fileId=${encodeURIComponent(fileId)}${cellParam}`;
      imageUrl = `${origin}/api/og?fileId=${encodeURIComponent(fileId)}${cellParam}`;

      try {
        const data = await fetchNotebookFromRegistry(fileId);
        const meta = extractNotebookMeta(data.notebook, data.entry, cellId);
        title = meta.title;
        raag = meta.raag;
        cellTitle = meta.cellTitle;
        description = meta.description;
      } catch (err) {
        console.warn(`Could not load registry info for fileId ${fileId}:`, err);
      }
    }

    const baseHtml = await getBaseHtml(origin);

    // Title generation format:
    // If cellId is mentioned: (Raag Yaman - Tan 1 - Sargam Notebook)
    // If no cellId: (Raag Yaman - Sargam Notebook)
    const displayRaag = raag && raag !== 'Indian Classical Music' ? raag : title;
    let displayTitle = '';
    if (cellId && cellTitle) {
      displayTitle = `${displayRaag} - ${cellTitle} - Sargam Notebook`;
    } else {
      displayTitle = `${displayRaag} - Sargam Notebook`;
    }

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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    res.status(200).send(html);
  } catch (error: any) {
    console.error('Error in share handler:', error);
    const fallbackHtml = await getBaseHtml(origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(fallbackHtml);
  }
}
