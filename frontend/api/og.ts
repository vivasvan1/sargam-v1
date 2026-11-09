import type { VercelRequest, VercelResponse } from '@vercel/node';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { fetchNotebookFromRegistry, extractNotebookMeta, type ExtractedMeta } from './_utils';

let cachedFont: Buffer | null = null;

async function getFontData(): Promise<Buffer> {
  if (cachedFont) return cachedFont;

  const fontPaths = [
    path.join(process.cwd(), 'public', 'Geist-Regular.ttf'),
    path.join(process.cwd(), 'dist', 'Geist-Regular.ttf'),
    path.join(process.cwd(), 'node_modules', '@vercel', 'og', 'dist', 'Geist-Regular.ttf'),
  ];

  for (const p of fontPaths) {
    if (fs.existsSync(p)) {
      try {
        cachedFont = fs.readFileSync(p);
        return cachedFont;
      } catch {}
    }
  }

  // Fallback: fetch font from CDN
  const cdnUrl = 'https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/Geist-Regular.ttf';
  const response = await fetch(cdnUrl);
  if (!response.ok) {
    throw new Error(`Failed to load font from CDN: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  cachedFont = Buffer.from(arrayBuffer);
  return cachedFont;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fileId = (req.query.fileId as string) || '';

    let meta: ExtractedMeta = {
      title: 'Speede Sargam Notebook',
      author: '',
      raag: 'Indian Classical Music',
      thaat: '',
      vadi: '',
      samvadi: '',
      time: '',
      tala: '',
      sa: '',
      cellTitle: '',
      noteLines: [],
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

    const fontData = await getFontData();

    const notes = meta.noteLines[0]
      ? meta.noteLines[0].split(/\s+/).filter(Boolean).slice(0, 11)
      : ['S', 'R', 'G', 'M', 'P', 'D', 'N', "S'", '||'];

    const secondLineNotes = meta.noteLines[1]
      ? meta.noteLines[1].split(/\s+/).filter(Boolean).slice(0, 11)
      : null;

    const jsx: any = {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#090a10',
          backgroundImage:
            'radial-gradient(circle at 10% 20%, rgba(245, 158, 11, 0.12) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(99, 102, 241, 0.15) 0%, transparent 45%), linear-gradient(135deg, #090a10 0%, #10121d 50%, #191629 100%)',
          padding: '48px 56px',
          fontFamily: 'Geist',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        },
        children: [
          // 1. Top Bar
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '14px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            backgroundColor: '#f59e0b',
                            color: '#000000',
                            fontSize: '22px',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                          },
                          children: '𝄞',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', flexDirection: 'column' },
                          children: [
                            {
                              type: 'span',
                              props: {
                                style: {
                                  fontSize: '19px',
                                  fontWeight: 'bold',
                                  letterSpacing: '3px',
                                  color: '#f59e0b',
                                },
                                children: 'SPEEDE SARGAM',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  fontSize: '12px',
                                  letterSpacing: '1.5px',
                                  color: '#94a3b8',
                                  textTransform: 'uppercase',
                                },
                                children: 'Indian Music Notebook',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', gap: '10px' },
                    children: [
                      meta.tala
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                color: '#fbbf24',
                                fontSize: '14px',
                                fontWeight: '600',
                              },
                              children: `🥁 ${meta.tala}`,
                            },
                          }
                        : null,
                      meta.sa
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                border: '1px solid rgba(99, 102, 241, 0.35)',
                                color: '#c7d2fe',
                                fontSize: '14px',
                                fontWeight: '600',
                              },
                              children: `🎵 Sa = ${meta.sa}`,
                            },
                          }
                        : null,
                    ].filter(Boolean),
                  },
                },
              ],
            },
          },

          // 2. Middle Row: Raag Name & Composition Title
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '10px',
                marginBottom: '10px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '54px',
                      fontWeight: 'bold',
                      color: '#ffffff',
                      letterSpacing: '-0.5px',
                      textShadow: '0 2px 20px rgba(255, 255, 255, 0.15)',
                    },
                    children: meta.raag || meta.title,
                  },
                },
                meta.title && meta.title !== meta.raag
                  ? {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '24px',
                          color: '#cbd5e1',
                          fontWeight: '500',
                          lineHeight: '1.3',
                        },
                        children: meta.title,
                      },
                    }
                  : null,
                meta.author
                  ? {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '16px',
                          color: '#94a3b8',
                          marginTop: '2px',
                        },
                        children: `Composed & shared by ${meta.author}`,
                      },
                    }
                  : null,

                // Attribute pills (Thaat, Vadi, Samvadi, Time)
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '10px',
                      marginTop: '10px',
                      flexWrap: 'wrap',
                    },
                    children: [
                      meta.thaat
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                fontSize: '13px',
                                color: '#e2e8f0',
                              },
                              children: `Thaat: ${meta.thaat}`,
                            },
                          }
                        : null,
                      meta.vadi
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                fontSize: '13px',
                                color: '#e2e8f0',
                              },
                              children: `Vadi: ${meta.vadi}`,
                            },
                          }
                        : null,
                      meta.samvadi
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                fontSize: '13px',
                                color: '#e2e8f0',
                              },
                              children: `Samvadi: ${meta.samvadi}`,
                            },
                          }
                        : null,
                      meta.time
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                fontSize: '13px',
                                color: '#e2e8f0',
                              },
                              children: `Time: ${meta.time}`,
                            },
                          }
                        : null,
                    ].filter(Boolean),
                  },
                },
              ].filter(Boolean),
            },
          },

          // 3. First Music Cell Notation Preview Box
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '16px 22px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            fontSize: '13px',
                            fontWeight: '600',
                            letterSpacing: '1px',
                            color: '#f59e0b',
                            textTransform: 'uppercase',
                          },
                          children: `🎼 FIRST MUSIC CELL ${meta.cellTitle ? '• ' + meta.cellTitle : ''}`,
                        },
                      },
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: '12px', color: '#64748b' },
                          children: 'Sargam Notation Preview',
                        },
                      },
                    ],
                  },
                },
                // Line 1 notes
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
                    children: notes.map((n) => ({
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '38px',
                          height: '40px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          backgroundColor: n.includes('|')
                            ? 'rgba(245, 158, 11, 0.18)'
                            : 'rgba(255, 255, 255, 0.08)',
                          border: n.includes('|')
                            ? '1px solid rgba(245, 158, 11, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.12)',
                          fontSize: n.includes('|') ? '17px' : '20px',
                          fontWeight: 'bold',
                          color: n.includes('|') ? '#f59e0b' : '#ffffff',
                        },
                        children: n,
                      },
                    })),
                  },
                },
                // Line 2 notes (if available)
                secondLineNotes && secondLineNotes.length > 0
                  ? {
                      type: 'div',
                      props: {
                        style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
                        children: secondLineNotes.map((n) => ({
                          type: 'div',
                          props: {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '38px',
                              height: '40px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              backgroundColor: n.includes('|')
                                ? 'rgba(245, 158, 11, 0.18)'
                                : 'rgba(255, 255, 255, 0.08)',
                              border: n.includes('|')
                                ? '1px solid rgba(245, 158, 11, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.12)',
                              fontSize: n.includes('|') ? '17px' : '20px',
                              fontWeight: 'bold',
                              color: n.includes('|') ? '#f59e0b' : '#ffffff',
                            },
                            children: n,
                          },
                        })),
                      },
                    }
                  : null,
              ].filter(Boolean),
            },
          },

          // 4. Bottom Footer
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: '16px',
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: { fontSize: '14px', color: '#64748b' },
                    children: 'sargam.speede.site',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      color: '#f59e0b',
                      fontWeight: '600',
                    },
                    children: 'Open to Play & Practice in Interactive Visualizer ▶',
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(jsx, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Geist',
          data: fontData,
          weight: 400,
          style: 'normal',
        },
      ],
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngBuffer = resvg.render().asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Cache-Control',
      'public, immutable, no-transform, max-age=86400, s-maxage=604800'
    );
    res.status(200).send(pngBuffer);
  } catch (error: any) {
    console.error('Error generating OG image:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
}
