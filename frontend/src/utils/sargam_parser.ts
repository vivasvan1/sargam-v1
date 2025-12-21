/**
 * Minimal classes and parser for the `sargam-v1` notation in TypeScript.
 */

export interface Ornament {
  name: string;
  params: string[];
}

export interface NoteEvent {
  type: 'note';
  swara: string;
  octave: number;
  variant?: string;
  microtone?: [number, string];
  duration: number;
  ornaments: Ornament[];
  lyric?: string;
}

export interface RestEvent {
  type: 'rest';
  duration: number;
}

export interface HoldEvent {
  type: 'hold';
  duration: number;
}

export interface BarEvent {
  type: 'bar';
  double: boolean;
}

export type Event = NoteEvent | RestEvent | HoldEvent | BarEvent;

export interface Voice {
  name: string;
  events: Event[];
}

export interface MusicCell {
  directives: Record<string, string>;
  voices: Record<string, Voice>;
}

const SWARA_RE = /^[A-Za-z]+$/;
const VARIANT_SET = new Set(['k', 't', '#', 'b']);
const MICROTONE_RE = /n([+-])(\d+(?:\.\d+)?)(c|st)/;
const DURATION_RE = /:(\d+(?:\.\d+)?)$/;

export function parseMusicCell(lines: string[]): MusicCell {
  const directives: Record<string, string> = {};
  const voices: Record<string, Voice> = {};
  let currentVoice: Voice | null = null;

  let defaultDuration = 1.0;

  for (let rawLine of lines) {
    const line = rawLine.replace(/\n$/, '');
    if (!line.trim()) continue;

    if (line.startsWith('@')) {
      const parts = line.slice(1).split(/\s+/);
      const key = parts[0].toLowerCase();
      const value = parts.slice(1).join(' ');
      directives[key] = value;
      if (key === 'default_duration') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) defaultDuration = parsed;
      }
      continue;
    }

    if (line.toLowerCase().startsWith('#voice')) {
      const parts = line.split(/\s+/);
      const name = parts.length >= 2 ? parts[1] : 'default';
      if (!voices[name]) {
        voices[name] = { name, events: [] };
      }
      currentVoice = voices[name];
      continue;
    }

    if (!currentVoice) {
      if (!voices['default']) {
        voices['default'] = { name: 'default', events: [] };
      }
      currentVoice = voices['default'];
    }

    let content = line;
    if (line.includes('#')) {
      content = line.split('#')[0];
    }

    const tokens = content.trim().split(/\s+/).filter(tok => tok);
    for (const token of tokens) {
      const event = parseToken(token, defaultDuration);
      if (event) {
        currentVoice.events.push(event);
      }
    }
  }

  return { directives, voices };
}

export function parseToken(token: string, defaultDuration: number): Event | null {
  if (token === '|') return { type: 'bar', double: false };
  if (token === '||') return { type: 'bar', double: true };

  if (token.startsWith('_')) {
    const durStr = token.slice(1);
    const duration = durStr ? parseFloat(durStr) : defaultDuration;
    return { type: 'rest', duration };
  }

  if (token.startsWith('.')) {
    const durStr = token.slice(1);
    const duration = durStr ? parseFloat(durStr) : defaultDuration;
    return { type: 'hold', duration };
  }

  // 1. Split Lyric (=)
  let lyric: string | undefined;
  let restToken = token;
  const lyricIdx = token.indexOf('=');
  if (lyricIdx !== -1) {
    lyric = token.slice(lyricIdx + 1).replace(/"/g, '');
    restToken = token.slice(0, lyricIdx);
  }

  // 2. Split Ornaments (+)
  // Ornaments start with +, but + can also be inside a microtone (e.g., n+25c)
  // The ornament separator + will NOT be preceded by 'n'
  let ornamentsPart: string | undefined;
  let basePart = restToken;
  
  // Find the + that is not preceded by 'n'
  const plusMatch = restToken.match(/(?<!n)\+/);
  if (plusMatch && plusMatch.index !== undefined) {
    basePart = restToken.slice(0, plusMatch.index);
    ornamentsPart = restToken.slice(plusMatch.index + 1);
  }

  // 3. Parse Duration (:)
  let duration: number | undefined;
  const durMatch = basePart.match(DURATION_RE);
  if (durMatch) {
    duration = parseFloat(durMatch[1]);
    basePart = basePart.slice(0, durMatch.index);
  } else {
    duration = defaultDuration;
  }

  // 4. Parse Swara, Octave, and Variant
  // basePart contains Swara Octave? Variant?
  // Swara ends where Octave (',') or Variant (k, t, #, b, n) starts.
  const splitMatch = basePart.match(/[',kt#bn]/);
  let swara = basePart;
  let modifiers = '';
  if (splitMatch && splitMatch.index !== undefined) {
    swara = basePart.slice(0, splitMatch.index);
    modifiers = basePart.slice(splitMatch.index);
  }

  // Now modifiers contains Octave? Variant?
  const modMatch = modifiers.match(/^([',]*)(.*)$/);
  const octaveMarks = modMatch ? modMatch[1] : '';
  let restPart = modMatch ? modMatch[2] : '';

  let octave = 0;
  for (const ch of octaveMarks) {
    if (ch === "'") octave++;
    else if (ch === ',') octave--;
  }

  let variant: string | undefined;
  let microtone: [number, string] | undefined;

  if (restPart) {
    const m = restPart.match(MICROTONE_RE);
    if (m) {
      const sign = m[1] === '+' ? 1.0 : -1.0;
      const value = parseFloat(m[2]);
      const unit = m[3];
      microtone = [sign * value, unit];
    } else {
      variant = restPart;
    }
  }

  const ornaments: Ornament[] = [];
  if (ornamentsPart) {
    for (let part of ornamentsPart.split(',')) {
      part = part.trim();
      if (!part) continue;
      const m = part.match(/^([A-Za-z_]+)(\((.*?)\))?$/);
      if (m) {
        const name = m[1];
        const paramsStr = m[3];
        let params: string[] = [];
        if (paramsStr) {
          params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
        }
        ornaments.push({ name, params });
      } else {
        ornaments.push({ name: part, params: [] });
      }
    }
  }

  return {
    type: 'note',
    swara,
    octave,
    variant,
    microtone,
    duration,
    ornaments,
    lyric
  };
}
