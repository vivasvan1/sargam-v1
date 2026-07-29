import { Fragment } from 'react';
import Markdown from 'react-markdown';
import type { Notebook, NotebookCell } from '../types/notebook';
import {
  buildPrintMusicLayout,
  type PrintLanguage,
} from '../utils/printNotation';
import { useNotebookSettings } from '../context/NotebookSettingsContext';

interface PrintNotebookProps {
  notebook: Notebook;
}

const PRINT_COPY = {
  en: {
    subtitle: 'Indian music notebook',
    notation: 'Notation',
    cell: 'Cell',
    cycle: 'Cycle',
    beat: 'beat',
    beats: 'beats',
    sustain: 'note continues from the previous beat',
    chikari: 'chikari',
    rest: 'rest',
    skip: 'visual skip',
  },
  hi: {
    subtitle: 'भारतीय संगीत नोटबुक',
    notation: 'स्वरलिपि',
    cell: 'सेल',
    cycle: 'आवर्तन',
    beat: 'मात्रा',
    beats: 'मात्राएँ',
    sustain: 'स्वर पिछली मात्रा से जारी है',
    chikari: 'चिकारी',
    rest: 'विश्राम',
    skip: 'दृश्य विराम',
  },
} as const;

function PrintMusicCell({
  cell,
  index,
  language,
}: {
  cell: NotebookCell;
  index: number;
  language: PrintLanguage;
}) {
  const copy = PRINT_COPY[language];
  const layout = buildPrintMusicLayout(cell.source, language);
  const firstCommentRowIndex = layout.rows.findIndex(
    (row) => row.comments.length > 0
  );
  const firstComment =
    firstCommentRowIndex >= 0
      ? layout.rows[firstCommentRowIndex].comments[0]
      : undefined;
  const directiveTitle = layout.directives.title?.trim();
  const usesFirstCommentAsTitle = !directiveTitle && Boolean(firstComment);
  const cardTitle =
    directiveTitle || firstComment || `${copy.cell} ${index + 1}`;
  const cellLink = new URL(window.location.href);
  cellLink.searchParams.set('cellId', cell.id);
  const tala =
    layout.directives.tala ||
    layout.directives.taal ||
    `${layout.beatCount} ${layout.beatCount === 1 ? copy.beat : copy.beats}`;
  const details = [
    tala,
    layout.directives.raga,
    layout.directives.tempo ? `♩ ${layout.directives.tempo}` : null,
  ].filter(Boolean);

  return (
    <section className="print-music-cell">
      <div className="print-music-heading">
        <div>
          <p className="print-kicker">
            {copy.notation} {index + 1}
          </p>
          <h2 className="print-cell-title">
            <a href={cellLink.toString()}>{cardTitle}</a>
          </h2>
        </div>
        <p className="print-music-details">{details.join('  ·  ')}</p>
      </div>

      <table
        className="print-beat-table"
        style={
          {
            '--beat-columns': layout.beatCount,
          } as React.CSSProperties
        }
      >
        <thead>
          <tr>
            <th className="print-row-label">{copy.cycle}</th>
            {Array.from({ length: layout.beatCount }, (_, beat) => (
              <th
                key={beat}
                className={(beat + 1) % 4 === 0 ? 'print-vibhag-end' : ''}
              >
                {beat + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layout.rows.map((row, rowIndex) => {
            const comments =
              usesFirstCommentAsTitle && rowIndex === firstCommentRowIndex
                ? row.comments.slice(1)
                : row.comments;

            return (
              <Fragment key={`${row.voice}-${row.cycle}`}>
                {comments.length > 0 && (
                  <tr className="print-comment-row">
                    <td colSpan={layout.beatCount + 1}>
                      {comments.join(' · ')}
                    </td>
                  </tr>
                )}
                <tr>
                  <th className="print-row-label">
                    <span>{row.cycle}</span>
                    {row.voice !== 'default' && <small>{row.voice}</small>}
                  </th>
                  {row.beats.map((beat, beatIndex) => (
                    <td
                      key={beatIndex}
                      className={
                        (beatIndex + 1) % 4 === 0 ? 'print-vibhag-end' : ''
                      }
                    >
                      {beat.entries.length > 0 ? (
                        <span
                          className={`print-note-group ${
                            beat.entries.length <= 6
                              ? 'print-note-group-nowrap'
                              : 'print-note-group-wrap'
                          } print-note-count-${Math.min(beat.entries.length, 6)}`}
                        >
                          {beat.entries.map((entry, entryIndex) => (
                            <span
                              key={`${entry}-${entryIndex}`}
                              className={
                                entry === '—'
                                  ? 'print-sustain'
                                  : entry === '∫'
                                    ? 'print-chikari'
                                    : undefined
                              }
                            >
                              {entry}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="print-empty-beat">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function PrintNotebook({ notebook }: PrintNotebookProps) {
  const { language } = useNotebookSettings();
  const copy = PRINT_COPY[language];
  let musicCellIndex = 0;

  return (
    <article className="print-notebook" aria-hidden="true" lang={language}>
      <header className="print-cover">
        <p className="print-brand">Speede Sargam</p>
        <h1>{notebook.metadata?.title || 'Untitled Notebook'}</h1>
        <div className="print-rule" />
        <p className="print-subtitle">{copy.subtitle}</p>
      </header>

      <main>
        {notebook.cells.map((cell) => {
          if (cell.cell_type === 'music') {
            const index = musicCellIndex++;
            return (
              <PrintMusicCell
                key={cell.id}
                cell={cell}
                index={index}
                language={language}
              />
            );
          }

          const content = Array.isArray(cell.source)
            ? cell.source.join('\n')
            : cell.source;
          return (
            <section key={cell.id} className="print-markdown">
              <Markdown>{content}</Markdown>
            </section>
          );
        })}
      </main>

      <footer className="print-legend">
        <span>
          <strong>—</strong> {copy.sustain}
        </span>
        <span>
          <strong>∫</strong> {copy.chikari}
        </span>
        <span>
          <strong>_</strong> {copy.rest}
        </span>
        <span>
          <strong>/</strong> {copy.skip}
        </span>
      </footer>
    </article>
  );
}
