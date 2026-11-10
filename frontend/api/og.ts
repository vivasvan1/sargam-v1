import fs from 'node:fs';
import path from 'node:path';
import opentype from '@shuding/opentype.js';
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

let wasmInitPromise: Promise<void> | null = null;
let cachedFont: any = null;

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

async function getFont(): Promise<any> {
  if (cachedFont) return cachedFont;

  const fontPaths = [
    path.join(process.cwd(), 'public', 'Geist-Regular.ttf'),
    path.join(process.cwd(), 'dist', 'Geist-Regular.ttf'),
    path.join(process.cwd(), 'frontend', 'public', 'Geist-Regular.ttf'),
  ];

  for (const p of fontPaths) {
    if (fs.existsSync(p)) {
      try {
        const buffer = fs.readFileSync(p);
        cachedFont = opentype.parse(buffer.buffer);
        return cachedFont;
      } catch (e) {
        console.warn(`Could not read font from ${p}:`, e);
      }
    }
  }

  // Fallback to CDN
  const cdnUrl = 'https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/Geist-Regular.ttf';
  const res = await fetch(cdnUrl);
  if (!res.ok) throw new Error(`Failed to fetch font from CDN: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  cachedFont = opentype.parse(arrayBuffer);
  return cachedFont;
}

function renderTextPath(
  font: any,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  align: 'left' | 'center' | 'right' = 'left'
): string {
  if (!text) return '';
  let startX = x;
  if (align === 'center') {
    const width = font.getAdvanceWidth(text, fontSize);
    startX = x - width / 2;
  } else if (align === 'right') {
    const width = font.getAdvanceWidth(text, fontSize);
    startX = x - width;
  }
  try {
    const pathData = font.getPath(text, startX, y, fontSize).toPathData(2);
    return `<path d="${pathData}" fill="${fill}" />`;
  } catch (err) {
    console.warn(`Failed to render glyph path for "${text}":`, err);
    return '';
  }
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
    description: '',
  };
}

function renderNotesRow(
  font: any,
  tokens: string[],
  startY: number,
  isAmber: boolean,
  startX: number = 90
): { rects: string; paths: string } {
  let x = startX;
  let rects = '';
  let paths = '';
  const pillBg = isAmber ? 'rgba(245, 158, 11, 0.16)' : 'rgba(99, 102, 241, 0.16)';
  const strokeColor = isAmber ? 'rgba(245, 158, 11, 0.55)' : 'rgba(99, 102, 241, 0.55)';
  const textColor = isAmber ? '#fef3c7' : '#e0e7ff';

  const count = tokens.length;
  let fontSize = 46;
  let pillHeight = 76;
  let pad = 44;
  let gap = 20;

  if (count > 9) {
    fontSize = 38;
    pillHeight = 64;
    pad = 32;
    gap = 14;
  }

  for (const t of tokens) {
    if (t.startsWith('|')) {
      const cleanBar = t.replace(/="[^"]*"/g, '');
      paths += renderTextPath(font, cleanBar, x + 6, startY + (pillHeight * 0.7), fontSize - 4, '#94a3b8', 'left');
      x += 46;
    } else {
      const textWidth = font.getAdvanceWidth(t, fontSize);
      const width = Math.max(pillHeight, textWidth + pad);
      rects += `
        <rect x="${x}" y="${startY}" width="${width}" height="${pillHeight}" rx="14" fill="${pillBg}" stroke="${strokeColor}" stroke-width="2" />
      `;
      paths += renderTextPath(font, t, x + width / 2, startY + (pillHeight * 0.69), fontSize, textColor, 'center');
      x += width + gap;
    }
  }
  return { rects, paths };
}

function buildOgSvgWithFont(font: any, meta: ExtractedMeta): string {
  const displayRaag = meta.raag && meta.raag !== 'Indian Classical Music' ? meta.raag : meta.title;

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

  let textPaths = '';

  // 1. Raag Hero Title & Subtitle (Left Header)
  textPaths += renderTextPath(font, displayRaag, 60, 96, 54, '#ffffff');

  const subtitle = meta.cellTitle ? `${meta.cellTitle} • ${meta.title}` : meta.title;
  if (subtitle && !subtitle.toLowerCase().includes(displayRaag.toLowerCase())) {
    textPaths += renderTextPath(font, subtitle, 60, 138, 24, '#94a3b8');
  } else if (meta.cellTitle) {
    textPaths += renderTextPath(font, meta.cellTitle, 60, 138, 24, '#94a3b8');
  } else if (meta.title && meta.title !== displayRaag) {
    textPaths += renderTextPath(font, meta.title, 60, 138, 24, '#94a3b8');
  }

  // 2. Badges on Top Right (Classical attributes)
  const badges: { label: string; textCol: string; bgCol: string; strokeCol: string }[] = [];
  if (meta.thaat) {
    badges.push({
      label: `Thaat: ${meta.thaat}`,
      textCol: '#fef3c7',
      bgCol: 'rgba(245, 158, 11, 0.15)',
      strokeCol: 'rgba(245, 158, 11, 0.4)',
    });
  }
  if (meta.vadi) {
    badges.push({
      label: `Vadi: ${meta.vadi}`,
      textCol: '#e0e7ff',
      bgCol: 'rgba(99, 102, 241, 0.15)',
      strokeCol: 'rgba(99, 102, 241, 0.4)',
    });
  }
  if (meta.samvadi) {
    badges.push({
      label: `Samvadi: ${meta.samvadi}`,
      textCol: '#f3e8ff',
      bgCol: 'rgba(168, 85, 247, 0.15)',
      strokeCol: 'rgba(168, 85, 247, 0.4)',
    });
  }
  if (meta.time) {
    badges.push({
      label: meta.time.replace(/\s*\([^)]*\)/, ''),
      textCol: '#cbd5e1',
      bgCol: 'rgba(255, 255, 255, 0.08)',
      strokeCol: 'rgba(255, 255, 255, 0.2)',
    });
  }

  let badgeRects = '';
  let rightX = 1140;
  for (let i = badges.length - 1; i >= 0; i--) {
    const b = badges[i];
    const textWidth = font.getAdvanceWidth(b.label, 18);
    const badgeWidth = textWidth + 32;
    const badgeX = rightX - badgeWidth;
    badgeRects += `
    <rect x="${badgeX}" y="60" width="${badgeWidth}" height="42" rx="10" fill="${b.bgCol}" stroke="${b.strokeCol}" stroke-width="1.5" />
    `;
    textPaths += renderTextPath(font, b.label, badgeX + badgeWidth / 2, 87, 18, b.textCol, 'center');
    rightX = badgeX - 12;
  }

  // 3. Notation Card Content
  let notationRects = '';

  if (sec2) {
    // Two sections (e.g. Aroha & Avroha)
    textPaths += renderTextPath(font, sec1.title.toUpperCase(), 90, 212, 28, '#fbbf24');
    const r1 = renderNotesRow(font, sec1.notes, 232, true, 90);
    notationRects += r1.rects;
    textPaths += r1.paths;

    textPaths += renderTextPath(font, sec2.title.toUpperCase(), 90, 372, 28, '#a5b4fc');
    const r2 = renderNotesRow(font, sec2.notes, 392, false, 90);
    notationRects += r2.rects;
    textPaths += r2.paths;
  } else {
    // Single section (e.g. Tan 1, Drut Gat)
    const title = (sec1.title || meta.cellTitle || 'Notation').toUpperCase();
    textPaths += renderTextPath(font, title, 90, 215, 30, '#fbbf24');

    if (sec1.notes.length > 8) {
      const row1Tokens = sec1.notes.slice(0, 8);
      const row2Tokens = sec1.notes.slice(8, 16);
      const r1 = renderNotesRow(font, row1Tokens, 248, true, 90);
      const r2 = renderNotesRow(font, row2Tokens, 372, false, 90);
      notationRects += r1.rects + r2.rects;
      textPaths += r1.paths + r2.paths;
    } else {
      const r1 = renderNotesRow(font, sec1.notes, 275, true, 90);
      notationRects += r1.rects;
      textPaths += r1.paths;
    }
  }

  // 4. Footer
  if (meta.author) {
    textPaths += renderTextPath(font, `By ${meta.author}`, 60, 588, 22, '#94a3b8');
  }
  textPaths += renderTextPath(font, 'sargam.speede.site', 1140, 588, 24, '#94a3b8', 'right');

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
    </defs>
    
    <!-- Background Canvas -->
    <rect width="1200" height="630" fill="url(#bg)" />
    <rect width="1200" height="630" fill="url(#amberGlow)" />
    <rect width="1200" height="630" fill="url(#indigoGlow)" />
    
    <!-- Attribute Badges -->
    ${badgeRects}
    
    <!-- Notation Card Canvas -->
    <rect x="60" y="165" width="1080" height="375" rx="18" fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />
    
    <!-- Note Pill Rectangles -->
    ${notationRects}
    
    <!-- Vector Typography Paths (Crisp text independent of system fonts) -->
    ${textPaths}
  </svg>
  `;
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
        meta = extractNotebookMeta(data.notebook, data.entry, cellId);
      } catch (e) {
        console.warn(`Could not load registry notebook for fileId ${fileId}:`, e);
      }
    }

    // 1. Ensure font is loaded for vector glyph path generation
    const font = await getFont();

    // 2. Build vector SVG containing pre-rendered glyph paths
    const svg = buildOgSvgWithFont(font, meta);

    // 3. Render SVG to PNG via resvg WebAssembly
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

    // 4. Fallback: serve dynamic SVG vector image directly (never fallback to default preview image)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    res.status(200).send(svg);
  } catch (err: any) {
    console.error('Error in og handler:', err);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    res.status(200).send('<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#0a0b12"/><text x="100" y="100" fill="white" font-size="40">Speede Sargam</text></svg>');
  }
}
