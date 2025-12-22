import json
import sys
import os

# Import from current directory (root)
from sargam_parser import parse_music_cell, NoteEvent, RestEvent, HoldEvent, BarEvent

def event_to_dict(ev):
    if isinstance(ev, NoteEvent):
        return {
            "type": "note",
            "swara": ev.swara,
            "octave": ev.octave,
            "variant": ev.variant,
            "microtone": list(ev.microtone) if ev.microtone else None,
            "duration": ev.duration,
            "line_index": ev.line_index,
            "ornaments": [{"name": o.name, "params": o.params} for o in ev.ornaments],
            "lyric": ev.lyric
        }
    elif isinstance(ev, RestEvent):
        return {
            "type": "rest",
            "duration": ev.duration,
            "line_index": ev.line_index
        }
    elif isinstance(ev, HoldEvent):
        return {
            "type": "hold",
            "duration": ev.duration,
            "line_index": ev.line_index
        }
    elif isinstance(ev, BarEvent):
        return {
            "type": "bar",
            "double": ev.double,
            "line_index": ev.line_index
        }
    return None

def main():
    with open('cross_language_tests.json', 'r') as f:
        test_cases = json.load(f)
    
    results = []
    for test_string in test_cases:
        cell = parse_music_cell(test_string.splitlines())
        cell_dict = {
            "directives": cell.directives,
            "voices": {
                name: {
                    "name": v.name,
                    "events": [event_to_dict(ev) for ev in v.events]
                }
                for name, v in cell.voices.items()
            }
        }
        results.append(cell_dict)
    
    with open('python_results.json', 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()
