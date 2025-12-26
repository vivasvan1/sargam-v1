"""
Minimal classes and parser for the `sargam-v1` notation.

This module defines a set of data classes representing events in an Indian
music notebook and provides a simple parser that can convert text in
`sargam-v1` format into Python objects.  The parser is designed to be easy to
extend; it does not handle every edge case but demonstrates a reasonable
approach to building a sargam parser in Python.

For a formal grammar description of the language, see `sargam_spec.md` in the
same directory.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union

# ----------------------------------------------------------------------------
# Data classes
# ----------------------------------------------------------------------------

@dataclass
class Ornament:
    """Represents a musical ornament applied to a note."""

    name: str
    params: List[str] = field(default_factory=list)


@dataclass
class NoteEvent:
    swara: str
    octave: int = 0
    variant: Optional[str] = None
    microtone: Optional[Tuple[float, str]] = None
    duration: float = 1.0
    line_index: int = 0
    ornaments: List[Ornament] = field(default_factory=list)
    lyric: Optional[str] = None


@dataclass
class RestEvent:
    duration: float
    line_index: int = 0


@dataclass
class HoldEvent:
    duration: float
    line_index: int = 0


@dataclass
class BarEvent:
    double: bool = False
    line_index: int = 0


Event = Union[NoteEvent, RestEvent, HoldEvent, BarEvent]


@dataclass
class Voice:
    """A collection of events belonging to a single voice/track."""

    name: str
    events: List[Event] = field(default_factory=list)


@dataclass
class MusicCell:
    """Represents a music cell with directives and voices."""

    directives: Dict[str, str] = field(default_factory=dict)
    voices: Dict[str, Voice] = field(default_factory=dict)


@dataclass
class MarkdownCell:
    """Represents a markdown cell."""

    source: str


Cell = Union[MarkdownCell, MusicCell]


@dataclass
class Notebook:
    """Represents an entire Indian Music Notebook."""

    version: int
    metadata: Dict[str, str]
    cells: List[Cell]


# ----------------------------------------------------------------------------
# Parsing utilities
# ----------------------------------------------------------------------------

_swara_re = re.compile(r"^[A-Za-z]+$")
_variant_set = {'k', 't', '#', 'b'}
_microtone_re = re.compile(r"n(?P<sign>[+-])(?P<value>\d+(?:\.\d+)?)(?P<unit>c|st)")
_duration_re = re.compile(r":(?P<value>\d+(?:\.\d+)?)$")


def parse_imnb(filename: str) -> Notebook:
    """Load an .imnb file from disk and parse it into a Notebook object."""
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)

    version = data.get('imnb_version', 1)
    metadata = data.get('metadata', {})
    cells_data = data.get('cells', [])

    cells: List[Cell] = []
    for cell in cells_data:
        cell_type = cell.get('cell_type')
        source_lines = cell.get('source', [])
        if cell_type == 'music':
            # Flatten source lines into a single string then split into lines
            lines = ''.join(source_lines).splitlines()
            music_cell = parse_music_cell(lines)
            cells.append(music_cell)
        else:
            # Treat any non‑music cell as markdown
            md_source = ''.join(source_lines)
            cells.append(MarkdownCell(source=md_source))

    return Notebook(version=version, metadata=metadata, cells=cells)


def parse_music_cell(lines: List[str]) -> MusicCell:
    """Parse the contents of a music cell into directives and voices."""
    directives: Dict[str, str] = {}
    voices: Dict[str, Voice] = {}
    current_voice: Optional[Voice] = None
    logical_line_index = 0

    # Default duration if not overridden by @default_duration
    default_duration = 1.0

    for idx, raw_line in enumerate(lines):
        line = raw_line.strip('\n')
        if not line.strip():
            continue  # skip empty lines
        
        # Increment logical line for each new text line (unless it's the very first one)
        if idx > 0:
            logical_line_index += 1
        if line.startswith('@'):
            key, *rest = line[1:].split(maxsplit=1)
            value = rest[0] if rest else ''
            directives[key.lower()] = value
            if key.lower() == 'default_duration':
                try:
                    default_duration = float(value)
                except ValueError:
                    default_duration = 1.0
            continue
        if line.lower().startswith('#voice'):
            parts = line.split()
            if len(parts) >= 2:
                name = parts[1]
            else:
                name = 'default'
            current_voice = voices.setdefault(name, Voice(name=name))
            continue
        # If we reach here, it is a note line
        if current_voice is None:
            current_voice = voices.setdefault('default', Voice(name='default'))
        # Remove trailing comments
        if '#' in line:
            content, _comment = line.split('#', 1)
        else:
            content = line
        tokens = [tok for tok in content.strip().split() if tok]
        for token in tokens:
            event = parse_token(token, default_duration, line_index=logical_line_index)
            if event is not None:
                current_voice.events.append(event)
                # If we encounter a double bar, increment logical line index
                if isinstance(event, BarEvent) and event.double:
                    logical_line_index += 1
    return MusicCell(directives=directives, voices=voices)


def parse_token(token: str, default_duration: float, line_index: int = 0) -> Optional[Event]:
    """Parse a single token into an Event.

    Returns None if the token is not recognized.
    """
    # Bar markers
    if token == '|':
        return BarEvent(double=False, line_index=line_index)
    if token == '||':
        return BarEvent(double=True, line_index=line_index)

    # Rest or hold
    if token.startswith('_') or token.startswith('.'):
        symbol = token[0]
        remainder = token[1:]
        if remainder.startswith(':'):
            remainder = remainder[1:]
        
        try:
            duration = float(remainder) if remainder else default_duration
        except ValueError:
            return None
            
        if symbol == '_':
            return RestEvent(duration=duration, line_index=line_index)
        else:
            return HoldEvent(duration=duration, line_index=line_index)

    # Split lyric if present
    lyric = None
    if '=' in token:
        note_part, lyric_part = token.split('=', 1)
        # remove quotes around lyric
        lyric = lyric_part.strip('"') if lyric_part else ''
    else:
        note_part = token

    # Split ornaments if present
    base_part = note_part
    ornaments_part = None
    # Use regex to find + that is NOT part of a microtone (n+ or n-)
    # Python re doesn't support variable length lookbehind, but (?<!n)\+ is fixed length.
    orn_match = re.search(r"(?<!n)\+", note_part)
    if orn_match:
        base_part = note_part[:orn_match.start()]
        ornaments_part = note_part[orn_match.start() + 1:]
    
    note_part = base_part

    # Split duration if present (colon at the end)
    duration = None
    if ':' in note_part:
        # Find the LAST colon
        last_colon = note_part.rfind(':')
        dur_part = note_part[last_colon+1:]
        try:
            duration = float(dur_part)
            note_part = note_part[:last_colon]
        except ValueError:
            pass

    # Check for lowercase komal swaras (r, g, d, n) - these are equivalent to Rk, Gk, Dk, Nk
    komal_map = {'r': 'R', 'g': 'G', 'd': 'D', 'n': 'N'}
    is_lowercase_komal = False
    if note_part and len(note_part) > 0 and note_part[0] in komal_map:
        # Check if it's a standalone lowercase komal swara (possibly with modifiers)
        # Match a single lowercase letter followed by optional modifiers
        komal_match = re.match(r"^([rgdn])(.*)$", note_part)
        if komal_match:
            lowercase_swara = komal_match.group(1)
            swara = komal_map[lowercase_swara]
            mods_part = komal_match.group(2)
            is_lowercase_komal = True
        else:
            # Fall through to normal parsing
            modifier_match = re.search(r"[',#b]|n[+-]|[kt](?![a-z])", note_part)
            if modifier_match:
                swara = note_part[:modifier_match.start()]
                mods_part = note_part[modifier_match.start():]
            else:
                swara = note_part
                mods_part = ""
    else:
        # Normal parsing for uppercase swaras
        # Modifiers are ', , k, t, #, b, n+, n-
        modifier_match = re.search(r"[',#b]|n[+-]|[kt](?![a-z])", note_part)
        if modifier_match:
            swara = note_part[:modifier_match.start()]
            mods_part = note_part[modifier_match.start():]
        else:
            swara = note_part
            mods_part = ""

    # Determine octave offset
    octave = 0
    for ch in mods_part:
        if ch == "'":
            octave += 1
        elif ch == ",":
            octave -= 1

    # Remove octave marks to find variant/microtone
    remaining_mods = mods_part.replace("'", "").replace(",", "")
    
    variant = None
    microtone = None
    if is_lowercase_komal:
        # Lowercase komal swaras always have variant='k'
        # But check if there are additional modifiers in remaining_mods
        if remaining_mods:
            m = _microtone_re.fullmatch(remaining_mods)
            if m:
                sign = 1.0 if m.group('sign') == '+' else -1.0
                value = float(m.group('value'))
                unit = m.group('unit')
                microtone = (sign * value, unit)
                variant = 'k'  # Still komal, but with microtone
            else:
                # If there are other modifiers, they should be combined with 'k'
                # For now, just use 'k' as the variant
                variant = 'k'
        else:
            variant = 'k'
    elif remaining_mods:
        m = _microtone_re.fullmatch(remaining_mods)
        if m:
            sign = 1.0 if m.group('sign') == '+' else -1.0
            value = float(m.group('value'))
            unit = m.group('unit')
            microtone = (sign * value, unit)
        else:
            variant = remaining_mods

    # Defaults
    duration = duration if duration is not None else default_duration

    # Parse ornaments
    ornaments: List[Ornament] = []
    if ornaments_part:
        for part in ornaments_part.split(','):
            part = part.strip()
            if not part:
                continue
            m = re.match(r"([A-Za-z_]+)(\((.*?)\))?$", part)
            if m:
                name = m.group(1)
                params_str = m.group(3)
                params = []
                if params_str:
                    params = [p.strip() for p in params_str.split(',') if p.strip()]
                ornaments.append(Ornament(name=name, params=params))
            else:
                ornaments.append(Ornament(name=part))

    return NoteEvent(
        swara=swara,
        octave=octave,
        variant=variant,
        microtone=microtone,
        duration=duration,
        line_index=line_index,
        ornaments=ornaments,
        lyric=lyric,
    )


# ----------------------------------------------------------------------------
# Example usage
# ----------------------------------------------------------------------------
if __name__ == '__main__':
    import pprint

    # Example demonstrating parser usage
    example_source = [
        '@language sargam-v1\n',
        '@raga Yaman\n',
        '@tala Tintal(16)\n',
        '@default_duration 1\n',
        '#voice melody\n',
        'S R G M | P D N S\' ||\n',
        "S' N D P | M G R S ||\n",  # Note: double quotes to escape single quote
        '#voice tanpura\n',
        'S,, . S,, . | P,, . S,, . ||\n',
    ]

    music_cell = parse_music_cell(example_source)
    print('Directives:')
    pprint.pprint(music_cell.directives)
    for name, voice in music_cell.voices.items():
        print(f"Voice {name}:")
        for event in voice.events:
            print('  ', event)
