from sargam_parser import parse_music_cell
import json

lines = [
    "# Voice 1",
    "S R G M ||",
    "P D N S' ||"
]

parsed = parse_music_cell(lines)
for name, voice in parsed.voices.items():
    print(f"Voice: {name}")
    for event in voice.events:
        print(f"  Event: {type(event).__name__}, line_index: {event.line_index if hasattr(event, 'line_index') else 'N/A'}")
