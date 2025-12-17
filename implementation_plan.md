# Sargam Notebook Implementation Plan

## Goal Description
Fix playback control (Stop button), add Taal/Metronome playback, and address sub-beat notation.

## Proposed Changes

### Frontend (React/Vite)
- **File**: `frontend/src/App.jsx`
    - **Stop Bug**: Refactor `playMusic` to use `Tone.Transport` instead of raw `Tone.now()`.
        - Use `Tone.Transport.schedule()` for notes.
        - `handlePlay` should call `Tone.Transport.start()` and `Tone.Transport.stop()`.
        - Ensure `Tone.Transport.cancel()` is called on stop to clear events.
    - **Taal Playback**:
        - Check `parsedData.directives.tala`.
        - Parse format like `Name(Count)` (e.g., `Tintal(16)`).
        - Create a `Tone.Loop` or schedule beats on the Transport.
        - Use a percussive sound (e.g., `Tone.MembraneSynth` or just a click).
    - **Sub-beats**:
        - No code change for basic support (use `@default_duration`).
        - *Optional*: Add visual indication or grouping support if needed, but for now just documentation.

## Verification Plan

### Manual Verification
1.  **Stop Button**: Play a long sequence -> Click Stop -> Sound should stop immediately.
2.  **Taal**: Add `@tala Tintal(16)` to a cell -> Play -> Should hear a distinct beat/click.
3.  **Sub-beats**: Write `@default_duration 0.5` -> Verify faster playback compared to default.
