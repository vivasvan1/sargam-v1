import fs from 'node:fs';
import path from 'node:path';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { fetchNotebookFromRegistry, extractNotebookMeta, type ExtractedMeta } from './_utils.js';

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

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId') || '';

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

    // 1. Ensure resvg WebAssembly runtime is loaded
    await ensureWasmInitialized();

    // 2. Generate pristine SVG
    const svg = buildOgSvg(meta);

    // 3. Render SVG directly to PNG
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'original' },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return new Response(pngBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    console.error('Error in og handler:', err);
    return new Response(`Error rendering image: ${err?.message || err}`, { status: 500 });
  }
}
