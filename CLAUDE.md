# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
cd frontend && npm install  # or bun install

# Run development server
cd frontend && npm run dev  # Available at http://localhost:5174

# Build for production
cd frontend && npm run build

# Preview production build
cd frontend && npm run preview

# Run linter
cd frontend && npm run lint

# Format code
cd frontend && npm run format
```

Docker dev (exposes port 5174):
```bash
docker-compose up
```

Parser smoke test (manual verification):
```bash
bun src/utils/test_parser.ts  # or npx ts-node
```

## Architecture

### High-Level Structure

This is a React/Vite browser application for editing and playing Indian classical music notations in the `.imnb` (Indian Music Notebook) format.

```
frontend/
├── src/
│   ├── components/       # React components
│   │   ├── MusicCell.tsx       # Main music notation editor/playback
│   │   ├── NotebookEditor.tsx  # Notebook cell management
│   │   ├── MusicVisualizer.tsx # Audio visualizer with playhead
│   │   └── ui/                 # shadcn/ui components (Radix UI + Tailwind)
│   ├── utils/
│   │   ├── sargam_parser.ts    # sargam-v1 DSL parser
│   │   └── test_parser.ts      # Parser smoke test
│   ├── lib/
│   │   ├── googleDrive.ts      # Google Drive integration
│   │   └── instruments.ts      # Tone.js instrument definitions
│   ├── store/                  # Zustand state stores
│   │   ├── useNotebookStore.ts
│   │   ├── useAuthStore.ts
│   │   └── usePlaybackStore.ts
│   ├── context/                # React context providers
│   │   └── NotebookSettingsContext.tsx
│   ├── hooks/                  # Custom React hooks
│   │   └── useNotebook.ts      # Notebook reducer with undo/redo
│   ├── types/                  # TypeScript types
│   │   └── notebook.ts
│   └── App.tsx                 # Main app component
```

### Key State Management

- **Zustand stores** (global):
  - `useNotebookStore` - Notebook instance, file ID, read-only/published status
  - `useAuthStore` - Google Drive authentication state
  - `usePlaybackStore` - Active cell ID and stop callback

- **React hooks** (local/component state):
  - `useNotebook` - Notebook reducer with undo/redo history
  - `useNotebookSettings` - Settings context (instruments, visualizer, auto-save)

### sargam-v1 DSL

The music notation language is defined in `sargam_spec.md` and parsed by `frontend/src/utils/sargam_parser.ts`. Key features:

- **Directives** (`@key value`): tempo, raga, tala, sa_pitch, default_duration
- **Voice declarations** (`#voice name`): Multiple concurrent parts
- **Note tokens**: Swaras (S,R,G,M,P,D,N) with octaves (`'`/`,`), variants (`k`=komal, `t`=tivra), duration (`:dur`), ornaments (`+meend(P)`), lyrics (`="lyric"`)
- **Special tokens**: `_` (rest), `.` (hold), `/` (skip), `|`/`||` (bar markers)

The parser produces an event model: `NoteEvent`, `RestEvent`, `HoldEvent`, `BarEvent`, `CommentEvent`, `SkipEvent`.

### Audio Engine

Uses **Tone.js** for playback:
- Instruments defined in `lib/instruments.ts` (Harmonium, Flute, Sitar, Tabla, etc.)
- Tabla uses sample-based playback via `Tone.Player` for bols (dha, dhin, tak, etc.)
- Tonal instruments use `Tone.PolySynth` or `Tone.Sampler`
- Playback is scheduled via `Tone.getTransport().schedule()`

### Google Drive Integration

- Uses Google Identity Services (new) for authentication
- Files stored in `sargamNotes` root folder
- Auto-save with 2s debounce when connected
- Published notebooks are accessible via public registry (Google Apps Script)

## Key Patterns

- TypeScript-first with path alias `@/` → `./src/*`
- UI uses shadcn/ui components (Radix UI primitives + Tailwind CSS)
- Music playback uses global `Tone.getTransport()` with scheduled events
- Parser preserves unknown directives/ornaments for extensibility
- Theme stored in localStorage as `sargam-theme` (`light`/`dark`)