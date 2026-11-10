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

function renderNotesRow(font: any, tokens: string[], startY: number, isAmber: boolean): { rects: string; paths: string } {
  let x = 80;
  let rects = '';
  let paths = '';
  const pillBg = isAmber ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)';
  const strokeColor = isAmber ? 'rgba(245, 158, 11, 0.45)' : 'rgba(99, 102, 241, 0.45)';
  const textColor = isAmber ? '#fef3c7' : '#e0e7ff';

  for (const t of tokens) {
    if (t.startsWith('|')) {
      const cleanBar = t.replace(/="[^"]*"/g, '');
      paths += renderTextPath(font, cleanBar, x + 6, startY + 34, 24, '#64748b', 'left');
      x += 36;
    } else {
      const textWidth = font.getAdvanceWidth(t, 22);
      const width = Math.max(50, textWidth + 28);
      rects += `
        <rect x="${x}" y="${startY}" width="${width}" height="48" rx="10" fill="${pillBg}" stroke="${strokeColor}" stroke-width="1.5" />
      `;
      paths += renderTextPath(font, t, x + width / 2, startY + 33, 22, textColor, 'center');
      x += width + 12;
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

  // 1. Top Header
  textPaths += renderTextPath(font, 'SPEEDE SARGAM', 80, 61, 12, '#fbbf24');
  textPaths += renderTextPath(font, 'Interactive Classical Notation', 224, 61, 14, '#94a3b8');

  if (meta.tala) {
    textPaths += renderTextPath(font, `Tala: ${meta.tala}`, 935, 61, 13, '#e2e8f0', 'center');
  }
  if (meta.sa) {
    textPaths += renderTextPath(font, `Sa = ${meta.sa}`, 1081, 61, 13, '#cbd5e1', 'center');
  }

  // 2. Raag Hero Title & Subtitle
  textPaths += renderTextPath(font, displayRaag, 52, 146, 48, '#ffffff');

  const subtitle = meta.cellTitle ? `${meta.cellTitle} • ${meta.title}` : meta.title;
  if (subtitle && !subtitle.toLowerCase().includes(displayRaag.toLowerCase())) {
    textPaths += renderTextPath(font, subtitle, 52, 178, 16, '#94a3b8');
  } else if (meta.cellTitle) {
    textPaths += renderTextPath(font, meta.cellTitle, 52, 178, 16, '#94a3b8');
  }

  // 3. Attribute Badges
  if (meta.thaat) {
    textPaths += renderTextPath(font, `Thaat: ${meta.thaat}`, 735, 136, 13, '#fef3c7', 'center');
  }
  if (meta.vadi) {
    textPaths += renderTextPath(font, `Vadi: ${meta.vadi}`, 847, 136, 13, '#e0e7ff', 'center');
  }
  if (meta.samvadi) {
    textPaths += renderTextPath(font, `Samvadi: ${meta.samvadi}`, 959, 136, 13, '#f3e8ff', 'center');
  }
  if (meta.time) {
    textPaths += renderTextPath(font, meta.time.replace(/\s*\([^)]*\)/, ''), 1087, 136, 13, '#cbd5e1', 'center');
  }

  // 4. Section 1 (Aroha / Tan 1)
  textPaths += renderTextPath(font, sec1.title.toUpperCase(), 80, 248, 13, '#fbbf24');
  textPaths += renderTextPath(font, meta.cellTitle || 'Music Cell', 1116, 248, 12, '#64748b', 'right');
  const row1 = renderNotesRow(font, sec1.notes, 266, true);
  textPaths += row1.paths;

  // 5. Section 2 (Avroha) if present
  let row2Rects = '';
  if (sec2) {
    textPaths += renderTextPath(font, sec2.title.toUpperCase(), 80, 382, 13, '#a5b4fc');
    const row2 = renderNotesRow(font, sec2.notes, 400, false);
    row2Rects = row2.rects;
    textPaths += row2.paths;
  }

  // 6. Footer
  const authorText = `By ${meta.author || 'Speede Sargam'}`;
  textPaths += renderTextPath(font, authorText, 52, 580, 15, '#e2e8f0');
  textPaths += renderTextPath(font, 'Play & Edit Visualizer • sargam.speede.site', 972, 579, 14, '#ffffff', 'center');

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
    
    <!-- Top Header: Logo Pill -->
    <rect x="52" y="40" width="156" height="32" rx="16" fill="rgba(245, 158, 11, 0.16)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1" />
    <circle cx="68" cy="56" r="4" fill="#f59e0b" />
    
    <!-- Header Right Badges -->
    ${
      meta.tala
        ? '<rect x="870" y="40" width="130" height="32" rx="8" fill="rgba(255, 255, 255, 0.08)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1" />'
        : ''
    }
    ${
      meta.sa
        ? '<rect x="1014" y="40" width="134" height="32" rx="8" fill="rgba(255, 255, 255, 0.08)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1" />'
        : ''
    }
    
    <!-- Attribute Badges -->
    ${
      meta.thaat
        ? '<rect x="680" y="116" width="110" height="30" rx="6" fill="rgba(245, 158, 11, 0.12)" stroke="rgba(245, 158, 11, 0.3)" stroke-width="1" />'
        : ''
    }
    ${
      meta.vadi
        ? '<rect x="802" y="116" width="90" height="30" rx="6" fill="rgba(99, 102, 241, 0.12)" stroke="rgba(99, 102, 241, 0.3)" stroke-width="1" />'
        : ''
    }
    ${
      meta.samvadi
        ? '<rect x="904" y="116" width="110" height="30" rx="6" fill="rgba(168, 85, 247, 0.12)" stroke="rgba(168, 85, 247, 0.3)" stroke-width="1" />'
        : ''
    }
    ${
      meta.time
        ? '<rect x="1026" y="116" width="122" height="30" rx="6" fill="rgba(255, 255, 255, 0.07)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1" />'
        : ''
    }
    
    <!-- First / Target Music Cell Preview Card -->
    <rect x="52" y="208" width="1096" height="310" rx="16" fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
    
    <!-- Note Pill Rectangles -->
    ${row1.rects}
    ${row2Rects}
    
    <!-- CTA Button -->
    <rect x="796" y="554" width="352" height="40" rx="20" fill="url(#ctaGrad)" />
    
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
