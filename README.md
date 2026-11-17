# Sargam 🎼

![Vercel](https://vercelbadge.vercel.app/api/github/vivasvan1/sargam-v1)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Tone.js](https://img.shields.io/badge/Tone.js-WebAudio-orange?style=flat)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)

> **Sargam** is a modern, web-based Indian Classical Music notebook environment that lets you compose, transcribe, visualize, and play Indian music notations alongside rich Markdown documentation in the `.imnb` (Indian Music Notebook) format.

---

## 📑 Table of Contents

- [Core Highlights](#-core-highlights)
- [Comprehensive Feature Tour](#-comprehensive-feature-tour)
  - [1. Mixed-Media Notebook Environment (`.imnb`)](#1-mixed-media-notebook-environment-imnb)
  - [2. Sargam Domain-Specific Language (`sargam-v1`)](#2-sargam-domain-specific-language-sargam-v1)
  - [3. Audio Engine & Multi-Sampled Instruments](#3-audio-engine--multi-sampled-instruments)
  - [4. Interactive Beat Grid & Visualizer](#4-interactive-beat-grid--visualizer)
  - [5. Virtual Sargam Keyboard](#5-virtual-sargam-keyboard)
  - [6. Audio-to-Sargam AI Transcription](#6-audio-to-sargam-ai-transcription)
  - [7. Google Drive & Community Registry](#7-google-drive--community-registry)
  - [8. Performance, Practice & Export Tools](#8-performance-practice--export-tools)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
- [Keyboard Shortcuts & Tips](#-keyboard-shortcuts--tips)
- [License](#-license)

---

## ✨ Core Highlights

- 🎵 **First-Class Sargam DSL (`sargam-v1`)**: Express Swaras (natural, komal, tivra), octaves, durations, meend, rests, holds, and rhythmic cycles (Talas) with simple text syntax.
- 🎹 **Authentic Multi-Instrument Audio Engine**: Powered by Tone.js with acoustic samples for Harmonium, Sitar (with Chikari drone strings), Bansuri Flute, Acoustic Tabla, Vocal Sargam singing, Piano, and Synth.
- 📊 **Dynamic Tala Beat Matrix**: Visualizes rhythmic cycles (Tintal, Ektaal, Jhaptal, Rupak, Keharwa, Dadra) in a strict beat-aligned table with a real-time animated playhead.
- 🎙️ **Audio-to-Sargam Transcription Engine**: Automatically detects the base tonic (Sa) via pitch class profiling, filters vocals/instruments, and transcribes audio into beat-synchronized Sargam notation.
- ☁️ **Cloud Auto-Save & Community Hub**: Seamless Google Drive integration for personal notebooks and a public community registry to publish and discover compositions.
- 📄 **Performance & Publishing Ready**: Features hands-free auto-scrolling, global zoom scaling, undo/redo history, and publication-ready sheet music printing.

---

## 🔍 Comprehensive Feature Tour

### 1. Mixed-Media Notebook Environment (`.imnb`)

Inspired by computational notebooks like Jupyter, Sargam structures musical works into modular **cells** saved as `.imnb` (Indian Music Notebook) JSON files:

- **Music Cells**: Dedicated cells for writing `sargam-v1` code, featuring an integrated editor, virtual keyboard, real-time beat grid visualizer, and multi-track audio mixer.
- **Markdown Cells**: Rich textual documentation rendered with GitHub Flavored Markdown and Tailwind typography. Perfect for bandish lyrics, raga theory, historical background, aaroh/avroha notes, and performance instructions.
- **Full History Stack**: Comprehensive Undo (`Ctrl/Cmd+Z`) and Redo (`Ctrl/Cmd+Shift+Z`) support across all cell operations.
- **Cell Management**: Add, duplicate, reorder, and delete cells with a single click.

---

### 2. Sargam Domain-Specific Language (`sargam-v1`)

The built-in parser (`frontend/src/utils/sargam_parser.ts`) reads an intuitive, human-friendly music notation grammar:

#### Swaras & Octaves
- **Natural Swaras (Shuddha)**: `S`, `R`, `G`, `M`, `P`, `D`, `N`
- **Flat Notes (Komal Swaras)**: `r`, `g`, `d`, `n` (or with `k` modifier, e.g., `Rk`, `Gk`)
- **Sharp Note (Tivra Ma)**: `Mt` (or `m`)
- **Octave Registers (Saptaks)**:
  - **Mandra Saptak (Lower Octave)**: Subscribed dot / comma `,` (e.g., `P,`, `D,`, `N,`)
  - **Madhya Saptak (Middle Octave)**: Base character (e.g., `S`, `R`, `G`)
  - **Taar Saptak (Upper Octave)**: Superscript dot / apostrophe `'` (e.g., `S'`, `R'`, `G'`)
  - Supports extreme octaves with multiple modifiers (e.g., `P,,` or `S''`).

#### Rhythmic Tokens & Durations
- **Note Durations**: Suffix notation `:dur` (e.g., `S:1` = 1 beat, `R:0.5` = half-beat/dugun, `G:0.25` = quarter-beat/chaugun).
- **Rests (`_`)**: Consumes audio and visual beat time in silence (e.g., `_:1`, `_:0.5`).
- **Holds (`.`)**: Sustains the previous note across subsequent beats.
- **Visual Skips (`/`)**: Creates a visual spacing gap without delaying audio playback (useful for aligning visual notation across voices).
- **Chikari Strokes (`^`)**: Triggers the resonant high drone string on sitar parts.
- **Vibhag & Cycle Delimiters**:
  - `|` — Division / Vibhag boundary marker.
  - `||` — Avartan cycle boundary (triggers a visual line break in the visualizer).

#### Directives (`@`)
Context directives set global and section-level parameters:
- `@tempo <bpm>`: Sets playback speed in beats per minute (e.g., `@tempo 120`).
- `@sa <pitch>` / `@sa_pitch <pitch>` / `@tonic <pitch>`: Sets reference Sa pitch (e.g., `C4`, `D4`, `Eb4`, `261.63Hz`).
- `@tala <name(beats)>`: Specifies the rhythmic framework (e.g., `@tala Teental(16)`).
- `@tala_pattern <bols>`: Specifies cyclic tabla accompaniment with custom bols (e.g., `@tala_pattern dha dhin dhin dha | dha dhin dhin dha | dha tin tin ta | ta dhin dhin dha`).
- `@raga <name>`, `@thaat <name>`, `@laya <vilambit|madhya|drut>`, `@default_duration <val>`.

#### Multi-Voice Layering
Declare multiple simultaneous parts with `#voice`:
```sargam-v1
@tempo 108
@sa D4
@tala Teental(16)

#voice melody
S R G M | P D N S' | S' N D P | M G R S ||

#voice tabla
dha dhin dhin dha | dha dhin dhin dha | dha tin tin ta | ta dhin dhin dha ||
```

#### Ornaments & Lyrics
- **Meend (Glissando)**: `+meend(P)` for smooth microtonal pitch bends between notes.
- **Kan (Grace notes), Gamak, Murki**: Expressive ornamentation metadata.
- **Lyrics Binding**: Append `="syllable"` directly to notes (e.g., `S="Ja" R="ye" G="tu"`).

---

### 3. Audio Engine & Multi-Sampled Instruments

Built on **Tone.js**, Sargam provides responsive, microtonally precise Web Audio playback:

- **Dynamic Tonic (Sa) Rescaling**: Changing `@sa` dynamically transposes all relative swaras according to Indian classical pitch ratios.
- **Instrument Library**:
  - **Harmonium**: Acoustic multi-octave harmonium samples.
  - **Sitar**: High-fidelity sampled sitar with dedicated **Chikari** drone string simulation.
  - **Bansuri / Flute**: Expressive acoustic woodwind samples.
  - **Vocal (Sargam)**: Natural human singing voices pronouncing the actual Swara syllables (`Sa`, `Re`, `Ga`, `Ma`, `Pa`, `Dha`, `Ni`).
  - **Tabla**: Sample-accurate acoustic tabla player with authentic bols (`dha`, `dhin`, `tin`, `ta`, `na`, `kat`, `tirakita`, `dhen`, `tun`, etc.), complemented by a physical membrane synthesizer model.
  - **Piano & Acoustic Guitar**: Clean Western acoustic samples.
  - **Synthesizer**: Polyphonic synth for electronic experimentation.
- **Multi-Track Mixer**:
  - Independent volume faders (dB) per voice.
  - Solo (`S`) and Mute (`M`) switches for isolating specific parts during practice.
  - Runtime instrument picker for each voice.
- **Flexible Playback Controls**: Play active cell, continuous "Play All" through the notebook, loop cycle toggle, and stop.

---

### 4. Interactive Beat Grid & Visualizer

The visualizer converts textual notation into a structured musical score tailored to Indian Classical conventions:

- **Strict Table Layout**: Organized as a rhythmic matrix where each column corresponds to a beat (e.g., 16 columns for Tintal).
- **Vibhag Organization**: Clear visual grouping for Taali and Khaali divisions.
- **Responsive Sizing**: Integrates a `ResizeObserver` engine that calculates column beat widths on the fly to prevent awkward horizontal overflow on tablets and laptops.
- **Synchronized Playhead**: A smooth, real-time animated indicator tracking the exact beat and note across all voices.
- **View Modes**: Instantly toggle between split Code + Visualizer, Visualizer-only, or Raw Code.
- **Note Legend**: Built-in modal explaining symbols, octave dots, komal/tivra notations, holds, and ornaments.

---

### 5. Virtual Sargam Keyboard

A tailored on-screen musical typing palette for rapid notation input without memorizing syntax:

- **Swara Keys**: Dedicated buttons for `S`, `r`, `R`, `g`, `G`, `M`, `Mt`, `P`, `d`, `D`, `n`, `N`.
- **Octave Selectors**: One-click octave shifts for Mandra (`,`) and Taar (`'`).
- **Duration Presets**: Quick insert for whole beats (`:1`), dugun (`:0.5`), and chaugun (`:0.25`).
- **Structural Tokens**: Quick insertion for vibhag bars (`|`), cycle ends (`||`), rests (`_`), holds (`.`), sitar chikari (`^`), and skips (`/`).

---

### 6. Audio-to-Sargam AI Transcription

Convert audio recordings of vocal or instrumental performances directly into notation through a guided 3-step wizard:

1. **Step 1 — Tonic (Sa) Detection**:
   - Computes Pitch Class Profiles (PCP / Chromagram).
   - Cross-correlates audio with Tanpura drone templates (Sa-Pa and Sa-Ma profiles).
   - Detects the base pitch, exact frequency (Hz), and cents offset deviation from standard A440, with manual adjustment controls.
2. **Step 2 — Audio Preprocessing & Segmentation**:
   - Interactive waveform display with region selection and playback auditioning.
   - Low-pass and vocal band-pass filtering to isolate melodic content from background noise or percussion.
3. **Step 3 — Rhythmic Transcription**:
   - YIN pitch tracking algorithm.
   - Tala selection: **Tintal (16)**, **Ektaal (12)**, **Jhaptal (10)**, **Rupak (7)**, **Keharwa (8)**, **Dadra (6)**, or **Free Rhythm**.
   - Configurable BPM, grid resolution (dugun or chaugun), and pickup beat positioning (Sam, Khali, or custom beat offset).
   - Automatically generates formatted `sargam-v1` code and inserts it directly as a new cell in your notebook.

---

### 7. Google Drive & Community Registry

- **Personal Google Drive Sync**:
  - Safe, minimal OAuth 2.0 authorization using Google Identity Services (`drive.file` scope only).
  - Background auto-save with a 2-second debounce timer to ensure no work is lost.
  - Dedicated Drive File Browser to open existing `.imnb` files, save revisions, or clone copies.
- **Public Community Registry**:
  - Publish compositions to the community registry with one click.
  - Powered by a Google Apps Script + Google Sheet serverless backend.
  - Explore, read, and load shared community notebooks without needing a private Google account.

---

### 8. Performance, Practice & Export Tools

- **Sheet Music Printing (`PrintNotebook`)**: Formats your composition into an uncluttered, high-contrast, print-optimized document ready for physical printing or PDF export.
- **Hands-Free Auto-Scroll**: Adjustable auto-scroll speed for reading long notations seamlessly during instrumental practice or live recitals.
- **Global Zoom Scaling**: Smoothly scale notation and interface size from 50% to 200% via dialog presets or custom zoom percentages.
- **Theming**: Flawless Dark Mode and Light Mode support with system preference synchronization.
- **Local File Import/Export**: Open and download local `.imnb` files without requiring an internet connection.

---

## 🛠️ Architecture & Tech Stack

```
sargam-v1/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── music-cell/           # Sargam Keyboard, Multi-track Mixer, Playback Controls
│   │   │   ├── visualizer/           # Beat Grid, Note Visualizer, Playhead, Legend
│   │   │   ├── audio-transcription/  # 3-Step Audio-to-Sargam transcription pipeline
│   │   │   ├── google-drive/         # Google Drive storage & public community browsers
│   │   │   ├── ui/                   # Accessible Radix UI + Tailwind v4 components
│   │   │   ├── MusicCell.tsx         # Primary music editor & Tone.js scheduling
│   │   │   ├── MarkdownCell.tsx      # Prose & lyrics editor
│   │   │   ├── NotebookEditor.tsx    # Notebook container & cell orchestrator
│   │   │   ├── MenuBar.tsx           # Global application menu & shortcuts
│   │   │   ├── Header.tsx            # Title, status badges, cloud state
│   │   │   ├── Sidebar.tsx           # Collapsible navigation & file actions
│   │   │   └── PrintNotebook.tsx     # Publication-grade print rendering
│   │   ├── utils/
│   │   │   ├── sargam_parser.ts      # sargam-v1 grammar parser & AST generator
│   │   │   ├── audio/                # Tonic detector, YIN pitch detector, transcriber
│   │   │   └── printNotation.ts      # Print layout transformation
│   │   ├── lib/
│   │   │   ├── instruments.ts        # Tone.js samplers & synth configurations
│   │   │   ├── googleAuth.ts         # Google Identity Services client
│   │   │   └── googleDrive.ts        # Drive & community registry API
│   │   ├── store/                    # Zustand state management
│   │   └── context/                  # Notebook settings provider
│   └── public/                       # Audio samples, demo notebooks, icons
```

| Layer | Technology |
|---|---|
| **Framework & Build** | React 19, TypeScript, Vite |
| **Styling & UI Components** | Tailwind CSS v4, shadcn/ui (Radix UI), Lucide Icons |
| **Audio Processing** | Tone.js (Web Audio API) |
| **Pitch & Audio Analysis** | YIN Algorithm, Pitch Class Profiling (PCP / Chromagram) |
| **Cloud Storage** | Google Drive API (`drive.file`), Google Apps Script Registry |
| **State Management** | Zustand & React Context |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [bun](https://bun.sh/)

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/vivasvan1/sargam-v1.git
   cd sargam-v1
   ```

2. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   # or
   bun install
   ```

3. **Configure Environment Variables (Optional for Google Drive):**
   ```bash
   cp .env.example .env.local
   ```
   Add your Google OAuth Client ID in `.env.local`:
   ```env
   VITE_GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
   ```

4. **Launch the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:4715](http://localhost:4715) in your browser.

5. **Run Verification & Build:**
   ```bash
   npm run build
   ```

---

## ⌨️ Keyboard Shortcuts & Tips

| Action | Shortcut / Gesture |
|---|---|
| **Undo** | `Ctrl + Z` / `Cmd + Z` |
| **Redo** | `Ctrl + Shift + Z` / `Cmd + Shift + Z` |
| **Play Active Cell** | Click Play button on cell control bar |
| **Play Entire Notebook** | Top Menu Bar > Play All |
| **Edit Markdown Cell** | Double-click the cell |
| **Preview Markdown Cell** | Click outside or press Save |
| **Change Notation Zoom** | Menu Bar > View > Zoom (50% - 200%) |
| **Toggle Auto-Scroll** | Menu Bar > Auto-scroll Play / Pause |
| **Print / Export PDF** | Menu Bar > File > Print |

---

## 📄 License

This project is licensed under the MIT License. Built with ❤️ for Indian Classical Music enthusiasts, researchers, teachers, and performers worldwide.
