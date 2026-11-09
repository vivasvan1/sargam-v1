import React from 'react';
import { ImageResponse } from '@vercel/og';
import { fetchNotebookFromRegistry, extractNotebookMeta, type ExtractedMeta } from './_utils';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
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

    const displayRaag = meta.raag && meta.raag !== 'Indian Classical Music' ? meta.raag : meta.title;
    const isDifferentTitle =
      meta.title && meta.raag && !meta.title.toLowerCase().includes(meta.raag.toLowerCase());

    // Prepare music cell sections for preview
    let sectionsToRender = meta.sections;
    if (sectionsToRender.length === 0) {
      // Fallback default scale
      sectionsToRender = [
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

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#0a0b12',
            backgroundImage:
              'radial-gradient(circle at 10% 15%, rgba(245, 158, 11, 0.22) 0%, transparent 45%), radial-gradient(circle at 90% 85%, rgba(99, 102, 241, 0.25) 0%, transparent 50%), linear-gradient(135deg, #090a10 0%, #111322 50%, #1a1730 100%)',
            padding: '44px 52px',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            boxSizing: 'border-box',
          }}
        >
          {/* 1. Header Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            {/* Logo & Tagline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(245, 158, 11, 0.16)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '9999px',
                  padding: '6px 16px',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#f59e0b',
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    letterSpacing: '1.5px',
                    color: '#fbbf24',
                    textTransform: 'uppercase',
                  }}
                >
                  SPEEDE SARGAM
                </span>
              </div>
              <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>
                Interactive Classical Notation
              </span>
            </div>

            {/* Tala & Sa Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {meta.tala ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  🥁 {meta.tala}
                </div>
              ) : null}

              {meta.sa ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                  }}
                >
                  🎼 Sa = {meta.sa}
                </div>
              ) : null}

              {meta.tempo ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#94a3b8',
                  }}
                >
                  {meta.tempo} BPM
                </div>
              ) : null}
            </div>
          </div>

          {/* 2. Middle Hero: Raag Title + Attributes + Music Cell Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%' }}>
            {/* Title & Badges */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    fontSize: '48px',
                    fontWeight: 900,
                    color: '#ffffff',
                    letterSpacing: '-1px',
                    lineHeight: '1.1',
                  }}
                >
                  {displayRaag}
                </div>
                {isDifferentTitle ? (
                  <div
                    style={{
                      fontSize: '17px',
                      color: '#94a3b8',
                      marginTop: '6px',
                      fontWeight: 500,
                    }}
                  >
                    {meta.title}
                  </div>
                ) : null}
              </div>

              {/* Classical Attributes Row */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {meta.thaat ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '13px',
                      color: '#fef3c7',
                      fontWeight: 600,
                    }}
                  >
                    Thaat: {meta.thaat}
                  </div>
                ) : null}

                {meta.vadi ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '13px',
                      color: '#e0e7ff',
                      fontWeight: 600,
                    }}
                  >
                    Vadi: {meta.vadi}
                  </div>
                ) : null}

                {meta.samvadi ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '13px',
                      color: '#f3e8ff',
                      fontWeight: 600,
                    }}
                  >
                    Samvadi: {meta.samvadi}
                  </div>
                ) : null}

                {meta.time ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.07)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '13px',
                      color: '#cbd5e1',
                      fontWeight: 600,
                    }}
                  >
                    {meta.time.replace(/\s*\([^)]*\)/, '')}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Music Cell Notation Card */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                padding: '20px 24px',
                gap: '16px',
                width: '100%',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              {sectionsToRender.slice(0, 2).map((sec, secIdx) => {
                const isAmberTheme = secIdx === 0;
                const accentColor = isAmberTheme ? '#fbbf24' : '#a5b4fc';
                const noteBg = isAmberTheme
                  ? 'rgba(245, 158, 11, 0.14)'
                  : 'rgba(99, 102, 241, 0.14)';
                const noteBorder = isAmberTheme
                  ? '1.5px solid rgba(245, 158, 11, 0.4)'
                  : '1.5px solid rgba(99, 102, 241, 0.4)';
                const noteTextColor = isAmberTheme ? '#fef3c7' : '#e0e7ff';

                return (
                  <div
                    key={secIdx}
                    style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}
                  >
                    {/* Section Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          letterSpacing: '1px',
                          color: accentColor,
                          textTransform: 'uppercase',
                        }}
                      >
                        {sec.title}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {secIdx === 0 ? 'First Music Cell' : ''}
                      </span>
                    </div>

                    {/* Notes Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {sec.notes.map((token, tokenIdx) => {
                        const isBarLine = token.startsWith('|');

                        if (isBarLine) {
                          return (
                            <div
                              key={tokenIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px 6px',
                                color: '#64748b',
                                fontSize: '24px',
                                fontWeight: 800,
                                letterSpacing: '-2px',
                              }}
                            >
                              {token.replace(/="[^"]*"/g, '')}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={tokenIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: noteBg,
                              border: noteBorder,
                              borderRadius: '10px',
                              padding: '8px 16px',
                              fontSize: '22px',
                              fontWeight: 800,
                              color: noteTextColor,
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                              minWidth: '40px',
                            }}
                          >
                            {token}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Footer Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            {/* Author */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {meta.author ? (
                <span style={{ fontSize: '15px', color: '#94a3b8', fontWeight: 500 }}>
                  By <strong style={{ color: '#e2e8f0' }}>{meta.author}</strong>
                </span>
              ) : (
                <span style={{ fontSize: '15px', color: '#94a3b8', fontWeight: 500 }}>
                  Sargam Classical Visualizer
                </span>
              )}
            </div>

            {/* Play Button CTA */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(90deg, #f59e0b, #ec4899)',
                borderRadius: '9999px',
                padding: '8px 22px',
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)',
              }}
            >
              <span>▶ Play & Edit Visualizer</span>
              <span style={{ opacity: 0.8 }}>• sargam.speede.site</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err: any) {
    console.error('Error in og handler:', err);
    return new Response(`Error rendering image: ${err?.message || err}`, { status: 500 });
  }
}
