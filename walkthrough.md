# Sargam Notebook Walkthrough

The Sargam Notebook application allows you to view, edit, and play Indian Classical Music notation in `.imnb` files.

## Prerequisites

- Node.js (Bun recommended)
- Python 3.8+

## Running the Application

1.  **Start the Backend**:
    ```bash
    cd backend
    uvicorn main:app --reload --port 8000
    ```
    (Or use the provided `uv run` command if configured)

2.  **Start the Frontend**:
    ```bash
    cd frontend
    bun dev
    ```

3.  **Open in Browser**:
    Navigate to [http://localhost:5173](http://localhost:5173).

## Features

- **Jupyter-like Interface**: 
    - **Sidebar**: Browse `.imnb` files in the project directory.
    - **Notebook**: Opens in the main area.
- **Editing**:
    - **Add Cells**: Hover between cells or at the bottom to see "+ Music" and "+ Markdown" buttons.
    - **Markdown**: Double-click to edit source.
    - **Music**: Edit sargam notation directly.
- **Playback**: Click "Play" in music cells to synthesize audio.
- **Persistence**: Save changes back to disk.

## Notation Guide
- **Notes**: `S R G M P D N`
- **Octaves**: `'` (High), `,` (Low). Example: `S'` or `N,`
- **Variants**: `k` (komal/flat), `t` (tivra/sharp). Example: `Rk`
- **Durations**: `:number`. Default is 1 beat. 
    - **Sub-beats**: Use fractional durations to play multiple notes in a beat. 
    - Example: `S:0.5 R:0.5` plays S and R in one beat (2 notes per beat).
- **Directives**:
    - `@default_duration 0.5` sets the default for all subsequent notes.
    - `@tala <Name>` enables a beat click track.

## File Structure

- `backend/`: FastAPI server and `sargam_parser.py`.
- `frontend/`: React Vite application.
- `sample.imnb`: Demo notebook file.

## Verification
- Validated that `sargam_parser.py` correctly parses text into structured events.
- Validated that the Backend API serves `./sample.imnb` and accepts parse requests.
- Validated Frontend loads and renders the notebook.
- **New**: Validated sidebar file listing and layout.
