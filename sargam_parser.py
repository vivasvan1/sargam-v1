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
    """Represents a single musical note.

    Attributes:
        swara:   The base swara (e.g. 'S', 'R', 'G', ... or 'R1' for Carnatic).
        octave:  Relative octave offset; 0 = middle, 1 = one above, -1 = one below.
        variant: Optional variant string ('k', 't', '#', 'b').
        microtone: Optional (value, unit) where unit is 'c' (cents) or 'st' (semitones).
        duration: Duration of the note in beats.  Default is 1.0.
        ornaments: List of Ornament objects.
        lyric: Optional lyric syllable.
    """

    swara: str
    octave: int = 0
    variant: Optional[str] = None
    microtone: Optional[Tuple[float, str]] = None
    duration: float = 1.0
    ornaments: List[Ornament] = field(default_factory=list)
    lyric: Optional[str] = None


@dataclass
class RestEvent:
    """Represents a rest (silence) with a given duration."""

    duration: float


@dataclass
class HoldEvent:
    """Represents an extension of the previous note."""

    duration: float


@dataclass
class BarEvent:
    """Represents a bar or cycle marker."""

    double: bool = False  # True for '||', False for '|'


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

    # Default duration if not overridden by @default_duration
    default_duration = 1.0

    for raw_line in lines:
        line = raw_line.strip('\n')
        if not line.strip():
            continue  # skip empty lines
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
            event = parse_token(token, default_duration)
            if event is not None:
                current_voice.events.append(event)
    return MusicCell(directives=directives, voices=voices)


def parse_token(token: str, default_duration: float) -> Optional[Event]:
    """Parse a single token into an Event.

    Returns None if the token is not recognized.
    """
    # Bar markers
    if token == '|':
        return BarEvent(double=False)
    if token == '||':
        return BarEvent(double=True)

    # Rest or hold
    if token.startswith('_'):
        dur = token[1:]
        duration = float(dur) if dur else default_duration
        return RestEvent(duration=duration)
    if token.startswith('.'):
        dur = token[1:]
        duration = float(dur) if dur else default_duration
        return HoldEvent(duration=duration)

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
    if '+' in note_part:
        base_part, ornaments_part = note_part.split('+', 1)

    # Parse swara, octave, variant, microtone, duration
    swara_match = re.match(r"([A-Za-z]+)([',]*)(.*)", base_part)
    if not swara_match:
        return None
    swara = swara_match.group(1)
    octave_marks = swara_match.group(2)
    rest_part = swara_match.group(3)

    # Determine octave offset
    octave = 0
    for ch in octave_marks:
        if ch == "'":
            octave += 1
        elif ch == ',':
            octave -= 1

    variant = None
    microtone: Optional[Tuple[float, str]] = None
    duration: Optional[float] = None

    # Check for variant/microtone and duration in rest_part
    # Duration appears at the end, starting with ':'
    dur_match = _duration_re.search(rest_part)
    if dur_match:
        try:
            duration = float(dur_match.group('value'))
        except ValueError:
            duration = None
        # Remove duration spec from rest_part
        rest_part = rest_part[:dur_match.start()]

    # The remainder may be a variant or microtone
    if rest_part:
        # microtone?
        m = _microtone_re.fullmatch(rest_part)
        if m:
            sign = 1.0 if m.group('sign') == '+' else -1.0
            value = float(m.group('value'))
            unit = m.group('unit')  # 'c' or 'st'
            microtone = (sign * value, unit)
        elif rest_part in _variant_set:
            variant = rest_part
        else:
            # Unknown suffix – treat as variant
            variant = rest_part

    # Default duration
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
                    # naive split on comma; real parser could handle nested lists
                    params = [p.strip() for p in params_str.split(',') if p.strip()]
                ornaments.append(Ornament(name=name, params=params))
            else:
                # unknown ornament; store name only
                ornaments.append(Ornament(name=part))

    return NoteEvent(
        swara=swara,
        octave=octave,
        variant=variant,
        microtone=microtone,
        duration=duration,
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
