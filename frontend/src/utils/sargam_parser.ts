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
  line_index?: number;
}

export interface RestEvent {
  type: 'rest';
  duration: number;
  line_index?: number;
}

export interface HoldEvent {
  type: 'hold';
  duration: number;
  line_index?: number;
}

export interface BarEvent {
  type: 'bar';
  double: boolean;
  line_index?: number;
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
const MICROTONE_RE = /^n([+-])(\d+(?:\.\d+)?)(c|st)$/;
const DURATION_RE = /:(\d+(?:\.\d+)?)$/;

export function parseMusicCell(lines: string[]): MusicCell {
  const directives: Record<string, string> = {};
  const voices: Record<string, Voice> = {};
  let currentVoice: Voice | null = null;
  let currentLineIndex = 0;

  let defaultDuration = 1.0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (i > 0) currentLineIndex++;

    // Handle both \r\n and \n by trimming
    const line = rawLine.trim().replace(/\r$/, '');
    if (!line) continue;

    if (line.startsWith('@')) {
      const match = line.slice(1).match(/^(\S+)\s*(.*)$/);
      if (match) {
        const key = match[1].toLowerCase();
        const value = match[2].trim();
        directives[key] = value;
        if (key === 'default_duration') {
          const parsed = parseFloat(value);
          if (!isNaN(parsed)) defaultDuration = parsed;
        }
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
        event.line_index = currentLineIndex;
        currentVoice.events.push(event);
        if (event.type === 'bar' && event.double) {
          currentLineIndex++;
        }
      }
    }
  }

  return { directives, voices };
}

export function parseToken(token: string, defaultDuration: number): Event | null {
  if (token === '|') return { type: 'bar', double: false };
  if (token === '||') return { type: 'bar', double: true };

  if (token.startsWith('_')) {
    let durStr = token.slice(1);
    if (durStr.startsWith(':')) durStr = durStr.slice(1);
    const duration = durStr ? parseFloat(durStr) : defaultDuration;
    return { type: 'rest', duration };
  }

  if (token.startsWith('.')) {
    let durStr = token.slice(1);
    if (durStr.startsWith(':')) durStr = durStr.slice(1);
    const duration = durStr ? parseFloat(durStr) : defaultDuration;
    return { type: 'hold', duration };
  }

  // 1. Split Lyric (=)
  let lyric: string | undefined;
  let lyricPart = '';
  let notePart = token;
  const lyricIdx = token.indexOf('=');
  if (lyricIdx !== -1) {
    lyric = token.slice(lyricIdx + 1).replace(/"/g, '');
    notePart = token.slice(0, lyricIdx);
  }

  // 2. Split Ornaments (+)
  // Ornaments start with +, but + can also be inside a microtone (e.g., n+25c)
  let ornamentsPart: string | undefined;
  
  // Find the + that is not part of a microtone (preceded by 'n')
  const ornMatch = notePart.match(/(?<!n)\+/);
  if (ornMatch && ornMatch.index !== undefined) {
    ornamentsPart = notePart.slice(ornMatch.index + 1);
    notePart = notePart.slice(0, ornMatch.index);
  }

  // 3. Split Duration (:) from the end of notePart
  let duration = defaultDuration;
  const lastColon = notePart.lastIndexOf(':');
  if (lastColon !== -1) {
    const durStr = notePart.slice(lastColon + 1);
    const parsedDur = parseFloat(durStr);
    if (!isNaN(parsedDur)) {
      duration = parsedDur;
      notePart = notePart.slice(0, lastColon);
    }
  }

  // 4. Parse Swara, Octave, and the rest (Variant, Microtone)
  // Check for lowercase komal swaras (r, g, d, n) - these are equivalent to Rk, Gk, Dk, Nk
  const komalMap: Record<string, string> = { 'r': 'R', 'g': 'G', 'd': 'D', 'n': 'N' };
  let isLowercaseKomal = false;
  
  let swara = notePart;
  let modsPart = '';
  
  if (notePart && notePart.length > 0 && notePart[0] in komalMap) {
    // Check if it's a standalone lowercase komal swara (possibly with modifiers)
    const komalMatch = notePart.match(/^([rgdn])(.*)$/);
    if (komalMatch) {
      const lowercaseSwara = komalMatch[1];
      swara = komalMap[lowercaseSwara];
      modsPart = komalMatch[2];
      isLowercaseKomal = true;
    } else {
      // Fall through to normal parsing
      const modifierMatch = notePart.match(/[',#b]|n[+-]|[kt](?![a-z])/);
      if (modifierMatch && modifierMatch.index !== undefined) {
        swara = notePart.slice(0, modifierMatch.index);
        modsPart = notePart.slice(modifierMatch.index);
      }
    }
  } else {
    // Normal parsing for uppercase swaras
    // Find where swara ends
    const modifierMatch = notePart.match(/[',#b]|n[+-]|[kt](?![a-z])/);
    if (modifierMatch && modifierMatch.index !== undefined) {
      swara = notePart.slice(0, modifierMatch.index);
      modsPart = notePart.slice(modifierMatch.index);
    }
  }

  let octave = 0;
  let variant: string | undefined;
  let microtone: [number, string] | undefined;

  for (const ch of modsPart) {
    if (ch === "'") octave++;
    else if (ch === ',') octave--;
  }

  // Remove octave marks to find variant/microtone
  const remainingMods = modsPart.replace(/'/g, '').replace(/,/g, '');

  if (isLowercaseKomal) {
    // Lowercase komal swaras always have variant='k'
    // But check if there are additional modifiers in remainingMods
    if (remainingMods) {
      const m = remainingMods.match(MICROTONE_RE);
      if (m) {
        const sign = m[1] === '+' ? 1.0 : -1.0;
        const value = parseFloat(m[2]);
        const unit = m[3];
        microtone = [sign * value, unit];
        variant = 'k';  // Still komal, but with microtone
      } else {
        // If there are other modifiers, they should be combined with 'k'
        // For now, just use 'k' as the variant
        variant = 'k';
      }
    } else {
      variant = 'k';
    }
  } else if (remainingMods) {
    const m = remainingMods.match(MICROTONE_RE);
    if (m) {
      const sign = m[1] === '+' ? 1.0 : -1.0;
      const value = parseFloat(m[2]);
      const unit = m[3];
      microtone = [sign * value, unit];
    } else {
      variant = remainingMods;
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
