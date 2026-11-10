import fs from 'node:fs';
import path from 'node:path';
import { Resvg, initWasm } from '@resvg/resvg-wasm';

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

function extractNotebookMeta(notebook: any, entry: any = {}): ExtractedMeta {
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

  // 3. Extract First Music Cell Details & Sections
  const musicCell = cells.find((c: any) => c.cell_type === 'music');
  let tala = '';
  let sa = '';
  let tempo = '';
  let cellTitle = '';
  const sections: MusicSection[] = [];

  if (musicCell) {
    const lines: string[] = Array.isArray(musicCell.source)
      ? musicCell.source
      : (musicCell.source || '').split('\n');

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
      } else if (trimmed.startsWith('@title ') && !cellTitle) {
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

let wasmInitPromise: Promise<void> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      // 1. Try local node_modules path
      try {
        const localWasmPath = path.join(
          process.cwd(),
          'node_modules',
          '@resvg',
          'resvg-wasm',
          'index_bg.wasm'
        );
        if (fs.existsSync(localWasmPath)) {
          const buffer = fs.readFileSync(localWasmPath);
          await initWasm(buffer);
          return;
        }
      } catch (err) {
        console.warn('Could not load local resvg wasm, falling back to CDN:', err);
      }

      // 2. Fallback to CDN
      const cdnUrl = 'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.4.1/index_bg.wasm';
      const response = await fetch(cdnUrl);
      if (!response.ok) {
        throw new Error(`Failed to load resvg wasm: ${response.status}`);
      }
      const wasmBuffer = await response.arrayBuffer();
      await initWasm(wasmBuffer);
    })();
  }
  return wasmInitPromise;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderNotesRow(tokens: string[], startY: number, isAmber: boolean): string {
  let x = 80;
  let items = '';
  const pillBg = isAmber ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)';
  const strokeColor = isAmber ? 'rgba(245, 158, 11, 0.45)' : 'rgba(99, 102, 241, 0.45)';
  const textColor = isAmber ? '#fef3c7' : '#e0e7ff';

  for (const t of tokens) {
    if (t.startsWith('|')) {
      const cleanBar = escapeXml(t.replace(/="[^"]*"/g, ''));
      items += `<text x="${x + 6}" y="${startY + 34}" fill="#64748b" font-size="24" font-family="sans-serif" font-weight="800">${cleanBar}</text>`;
      x += 36;
    } else {
      const width = Math.max(48, t.length * 16 + 24);
      const cleanNote = escapeXml(t);
      items += `
        <rect x="${x}" y="${startY}" width="${width}" height="48" rx="10" fill="${pillBg}" stroke="${strokeColor}" stroke-width="1.5" />
        <text x="${x + width / 2}" y="${startY + 32}" fill="${textColor}" font-size="22" font-family="sans-serif" font-weight="bold" text-anchor="middle">${cleanNote}</text>
      `;
      x += width + 12;
    }
  }
  return items;
}

function buildOgSvg(meta: ExtractedMeta): string {
  const displayRaag = escapeXml(
    meta.raag && meta.raag !== 'Indian Classical Music' ? meta.raag : meta.title
  );
  const isDifferentTitle =
    meta.title && meta.raag && !meta.title.toLowerCase().includes(meta.raag.toLowerCase());
  const escapedTitle = escapeXml(meta.title);

  let sections = meta.sections;
  if (!sections || sections.length === 0) {
    sections = [
      {
        title: 'Aroha (Ascent)',
        notes: ['S', 'R', 'G', 'M', 'P', 'D', 'N', "S'", '||'],
      },
      {
        title: 'Avroha (Descent)',
        notes: ["S'", 'N', 'D', 'P', 'M', 'G', 'R', 'S', '||'],
      },
    ];
  }

  const sec1 = sections[0];
  const sec2 = sections[1] || null;

  return `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0a0b12" />
        <stop offset="50%" stop-color="#111322" />
        <stop offset="100%" stop-color="#1a1730" />
      </linearGradient>
      <radialGradient id="amberGlow" cx="10%" cy="15%" r="45%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.22" />
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="indigoGlow" cx="90%" cy="85%" r="50%">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#ec4899" />
      </linearGradient>
    </defs>
    
    <!-- Background Canvas -->
    <rect width="1200" height="630" fill="url(#bg)" />
    <rect width="1200" height="630" fill="url(#amberGlow)" />
    <rect width="1200" height="630" fill="url(#indigoGlow)" />
    
    <!-- Top Header: Logo -->
    <rect x="52" y="40" width="156" height="32" rx="16" fill="rgba(245, 158, 11, 0.16)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1" />
    <circle cx="68" cy="56" r="4" fill="#f59e0b" />
    <text x="80" y="62" fill="#fbbf24" font-size="12" font-family="sans-serif" font-weight="800" letter-spacing="1.5">SPEEDE SARGAM</text>
    <text x="224" y="62" fill="#94a3b8" font-size="14" font-family="sans-serif" font-weight="500">Interactive Classical Notation</text>
    
    <!-- Top Header Right Badges -->
    ${
      meta.tala
        ? `
    <rect x="870" y="40" width="130" height="32" rx="8" fill="rgba(255, 255, 255, 0.08)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1" />
    <text x="935" y="61" fill="#e2e8f0" font-size="14" font-family="sans-serif" font-weight="600" text-anchor="middle">🥁 ${escapeXml(meta.tala)}</text>
    `
        : ''
    }
    
    ${
      meta.sa
        ? `
    <rect x="1014" y="40" width="134" height="32" rx="8" fill="rgba(255, 255, 255, 0.08)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1" />
    <text x="1081" y="61" fill="#cbd5e1" font-size="14" font-family="sans-serif" font-weight="600" text-anchor="middle">🎼 Sa = ${escapeXml(meta.sa)}</text>
    `
        : ''
    }

    <!-- Raag Hero Title -->
    <text x="52" y="146" fill="#ffffff" font-size="48" font-family="sans-serif" font-weight="900" letter-spacing="-1">${displayRaag}</text>
    ${
      isDifferentTitle
        ? `<text x="52" y="178" fill="#94a3b8" font-size="16" font-family="sans-serif" font-weight="500">${escapedTitle}</text>`
        : ''
    }
    
    <!-- Classical Attribute Badges -->
    ${
      meta.thaat
        ? `
    <rect x="680" y="116" width="110" height="30" rx="6" fill="rgba(245, 158, 11, 0.12)" stroke="rgba(245, 158, 11, 0.3)" stroke-width="1" />
    <text x="735" y="136" fill="#fef3c7" font-size="13" font-family="sans-serif" font-weight="600" text-anchor="middle">Thaat: ${escapeXml(meta.thaat)}</text>
    `
        : ''
    }

    ${
      meta.vadi
        ? `
    <rect x="802" y="116" width="90" height="30" rx="6" fill="rgba(99, 102, 241, 0.12)" stroke="rgba(99, 102, 241, 0.3)" stroke-width="1" />
    <text x="847" y="136" fill="#e0e7ff" font-size="13" font-family="sans-serif" font-weight="600" text-anchor="middle">Vadi: ${escapeXml(meta.vadi)}</text>
    `
        : ''
    }

    ${
      meta.samvadi
        ? `
    <rect x="904" y="116" width="110" height="30" rx="6" fill="rgba(168, 85, 247, 0.12)" stroke="rgba(168, 85, 247, 0.3)" stroke-width="1" />
    <text x="959" y="136" fill="#f3e8ff" font-size="13" font-family="sans-serif" font-weight="600" text-anchor="middle">Samvadi: ${escapeXml(meta.samvadi)}</text>
    `
        : ''
    }

    ${
      meta.time
        ? `
    <rect x="1026" y="116" width="122" height="30" rx="6" fill="rgba(255, 255, 255, 0.07)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1" />
    <text x="1087" y="136" fill="#cbd5e1" font-size="13" font-family="sans-serif" font-weight="600" text-anchor="middle">${escapeXml(meta.time.replace(/\s*\([^)]*\)/, ''))}</text>
    `
        : ''
    }

    <!-- First Music Cell Preview Card -->
    <rect x="52" y="208" width="1096" height="310" rx="16" fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
    
    <!-- Section 1 (Aroha) -->
    <text x="80" y="248" fill="#fbbf24" font-size="13" font-family="sans-serif" font-weight="700" letter-spacing="1">${escapeXml(sec1.title.toUpperCase())}</text>
    <text x="1116" y="248" fill="#64748b" font-size="12" font-family="sans-serif" text-anchor="end">First Music Cell</text>
    ${renderNotesRow(sec1.notes, 266, true)}
    
    <!-- Section 2 (Avroha) if present -->
    ${
      sec2
        ? `
    <text x="80" y="382" fill="#a5b4fc" font-size="13" font-family="sans-serif" font-weight="700" letter-spacing="1">${escapeXml(sec2.title.toUpperCase())}</text>
    ${renderNotesRow(sec2.notes, 400, false)}
    `
        : ''
    }

    <!-- Footer Bar -->
    <text x="52" y="580" fill="#94a3b8" font-size="15" font-family="sans-serif">By <tspan fill="#e2e8f0" font-weight="bold">${escapeXml(meta.author || 'Speede Sargam')}</tspan></text>
    
    <rect x="796" y="554" width="352" height="40" rx="20" fill="url(#ctaGrad)" />
    <text x="972" y="579" fill="#ffffff" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">▶ Play &amp; Edit Visualizer • sargam.speede.site</text>
  </svg>
  `;
}

export default async function handler(req: any, res: any) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'sargam.speede.site';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  try {
    let fileId = '';
    if (req.query?.fileId) {
      fileId = Array.isArray(req.query.fileId) ? req.query.fileId[0] : req.query.fileId;
    } else if (req.url) {
      try {
        const parsedUrl = new URL(req.url, origin);
        fileId = parsedUrl.searchParams.get('fileId') || '';
      } catch {}
    }

    let meta: ExtractedMeta = {
      title: 'Speede Sargam Notebook',
      author: '',
      raag: 'Indian Classical Music',
      thaat: '',
      vadi: '',
      samvadi: '',
      time: '',
      tala: 'Tintal(16)',
      sa: 'C4',
      tempo: '',
      cellTitle: '',
      sections: [],
      description: 'Interactive Indian Music Notation Notebook',
    };

    if (fileId) {
      try {
        const data = await fetchNotebookFromRegistry(fileId);
        meta = extractNotebookMeta(data.notebook, data.entry);
      } catch (e) {
        console.warn(`Could not load registry notebook for fileId ${fileId}:`, e);
      }
    }

    // 1. Build the dynamic SVG from this notebook's metadata and first music cell
    const svg = buildOgSvg(meta);

    // 2. Render SVG to PNG via resvg WebAssembly
    try {
      await ensureWasmInitialized();
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'original' },
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      res.setHeader('Content-Type', 'image/png');
      res.setHeader(
        'Cache-Control',
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
      );
      res.status(200).send(Buffer.from(pngBuffer));
      return;
    } catch (renderErr) {
      console.warn('Wasm PNG render failed, serving dynamic SVG directly:', renderErr);
    }

    // 3. Fallback: serve dynamic SVG vector image directly (never fallback to default preview image)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    res.status(200).send(svg);
  } catch (err: any) {
    console.error('Error in og handler:', err);
    // Dynamic SVG fallback with whatever metadata is available
    const fallbackSvg = buildOgSvg({
      title: 'Sargam Notebook',
      author: '',
      raag: 'Sargam Notebook',
      thaat: '',
      vadi: '',
      samvadi: '',
      time: '',
      tala: 'Tintal(16)',
      sa: 'C4',
      tempo: '',
      cellTitle: '',
      sections: [],
      description: 'Interactive Indian Music Notation Notebook',
    });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    res.status(200).send(fallbackSvg);
  }
}
