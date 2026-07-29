import {
  parseMusicCell,
  type Event,
  type MusicCell,
  type NoteEvent,
} from './sargam_parser';

export interface PrintBeatCell {
  entries: string[];
}

export interface PrintNotationRow {
  voice: string;
  cycle: number;
  beats: PrintBeatCell[];
}

export interface PrintMusicLayout {
  beatCount: number;
  comments: string[];
  directives: Record<string, string>;
  rows: PrintNotationRow[];
}

export type PrintLanguage = 'en' | 'hi';

const EPSILON = 0.000001;
const SWARA_NAMES_HI: Record<string, string> = {
  S: 'सा',
  R: 'रे',
  G: 'ग',
  M: 'म',
  P: 'प',
  D: 'ध',
  N: 'नी',
};

function getEventDuration(event: Event): number {
  return 'duration' in event && Number.isFinite(event.duration)
    ? Math.max(0, event.duration)
    : 0;
}

function formatNote(event: NoteEvent, language: PrintLanguage): string {
  if (event.swara === '^') return '∫';

  const swara =
    language === 'hi'
      ? SWARA_NAMES_HI[event.swara] || event.swara
      : event.swara;
  const octave =
    event.octave > 0
      ? "'".repeat(event.octave)
      : ','.repeat(Math.abs(event.octave));
  const variant = event.variant || '';
  const microtone = event.microtone
    ? `n${event.microtone[0] >= 0 ? '+' : ''}${event.microtone[0]}${event.microtone[1]}`
    : '';
  const ornaments = event.ornaments.length
    ? `+${event.ornaments
        .map((ornament) =>
          ornament.params.length
            ? `${ornament.name}(${ornament.params.join(',')})`
            : ornament.name
        )
        .join(',')}`
    : '';
  const lyric = event.lyric ? `=${event.lyric}` : '';

  return `${swara}${octave}${variant}${microtone}${ornaments}${lyric}`;
}

function formatEvent(event: Event, language: PrintLanguage): string {
  switch (event.type) {
    case 'note':
      return formatNote(event, language);
    case 'rest':
      return '_';
    case 'hold':
      return '.';
    case 'skip':
      return '/';
    default:
      return '';
  }
}

function getSpecifiedBeatCount(parsed: MusicCell): number | null {
  const candidates = [
    parsed.directives.tala,
    parsed.directives.taal,
    parsed.directives.beats,
    parsed.directives.beat,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const parenthesized = value.match(/\((\d+)\)/);
    const plainNumber = value.match(/^\s*(\d+)\s*$/);
    const match = parenthesized || plainNumber;
    if (match) {
      const count = Number.parseInt(match[1], 10);
      if (count > 0) return count;
    }
  }

  return null;
}

function getVoiceDuration(events: Event[]): number {
  return events.reduce(
    (duration, event) => duration + getEventDuration(event),
    0
  );
}

function addEntry(
  rows: Map<number, PrintBeatCell[]>,
  beatCount: number,
  absoluteBeat: number,
  entry: string
) {
  if (!entry) return;
  const cycle = Math.floor((absoluteBeat + EPSILON) / beatCount);
  const beat = Math.floor((absoluteBeat + EPSILON) % beatCount);

  if (!rows.has(cycle)) {
    rows.set(
      cycle,
      Array.from({ length: beatCount }, () => ({ entries: [] }))
    );
  }

  rows.get(cycle)![beat].entries.push(entry);
}

export function buildPrintMusicLayout(
  source: string[] | string,
  language: PrintLanguage = 'en'
): PrintMusicLayout {
  const lines = Array.isArray(source) ? source : source.split('\n');
  const parsed = parseMusicCell(lines);
  const comments = Object.values(parsed.voices)
    .flatMap((voice) => voice.events)
    .filter((event) => event.type === 'comment')
    .map((event) => event.text.replace(/^(#|\/\/)\s*/, '').trim())
    .filter(Boolean);

  const inferredBeatCount = Math.max(
    1,
    ...Object.values(parsed.voices).map((voice) =>
      Math.ceil(getVoiceDuration(voice.events))
    )
  );
  const beatCount = getSpecifiedBeatCount(parsed) ?? inferredBeatCount;
  const rows: PrintNotationRow[] = [];

  for (const voice of Object.values(parsed.voices)) {
    const voiceRows = new Map<number, PrintBeatCell[]>();
    let currentBeat = 0;

    for (const event of voice.events) {
      if (event.type === 'bar') {
        if (event.double) {
          // A double bar closes the phrase. Pad to the end of the current
          // tala cycle so a following pickup such as /:11 starts at beat 12
          // again instead of continuing from the phrase's raw duration.
          currentBeat =
            Math.ceil((currentBeat - EPSILON) / beatCount) * beatCount;
        }
        continue;
      }

      const duration = getEventDuration(event);
      if (duration <= 0) continue;

      addEntry(voiceRows, beatCount, currentBeat, formatEvent(event, language));

      const endBeat = currentBeat + duration;
      if (event.type === 'note' || event.type === 'hold') {
        const firstBoundary = Math.floor(currentBeat + EPSILON) + 1;
        for (
          let boundary = firstBoundary;
          boundary < endBeat - EPSILON;
          boundary++
        ) {
          addEntry(voiceRows, beatCount, boundary, '—');
        }
      }

      currentBeat = endBeat;
    }

    if (voiceRows.size === 0) {
      voiceRows.set(
        0,
        Array.from({ length: beatCount }, () => ({ entries: [] }))
      );
    }

    for (const [cycle, beats] of [...voiceRows.entries()].sort(
      ([a], [b]) => a - b
    )) {
      rows.push({
        voice: voice.name,
        cycle: cycle + 1,
        beats,
      });
    }
  }

  return {
    beatCount,
    comments: [...new Set(comments)],
    directives: parsed.directives,
    rows,
  };
}
