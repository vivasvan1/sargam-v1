import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import './App.css';
import { cn } from './lib/utils';

// Libs
import Markdown from 'react-markdown';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import * as Tone from 'tone';
import { toast, Toaster } from 'sonner';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Separator from '@radix-ui/react-separator';
import {
  Play,
  Square,
  Save,
  Plus,
  Trash2,
  FileMusic,
  Pencil,
  Music2,
  Layout,
  ChevronRight,
  MoreHorizontal
} from "lucide-react";

const API_BASE = 'http://localhost:8000/api';

function App() {
  const [notebook, setNotebook] = useState(null);
  const [filePath, setFilePath] = useState('');
  const [files, setFiles] = useState([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sargam-theme') || 'light';
  });

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sargam-theme', theme);
  }, [theme]);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/files`);
      const data = await res.json();
      setFiles(data.files);
      if (data.files.length > 0 && !filePath) {
        setFilePath(data.files[0]);
      }
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  };

  useEffect(() => {
    if (filePath) fetchNotebook(filePath);
  }, [filePath]);

  const fetchNotebook = async (path) => {
    try {
      const res = await fetch(`${API_BASE}/notebook?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('Failed to load notebook');
      const data = await res.json();
      setNotebook(data);
    } catch (err) {
      console.error(err);
    }
  };

  const saveNotebook = async () => {
    if (!notebook || !filePath) return;
    try {
      await fetch(`${API_BASE}/notebook?path=${encodeURIComponent(filePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notebook),
      });
      toast.success('Notebook saved successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save notebook');
    }
  };

  const addCell = (type, index) => {
    if (!notebook) return;
    const newCell = type === 'markdown'
      ? { cell_type: 'markdown', source: ['# New markdown cell\nDouble click to edit.'] }
      : { cell_type: 'music', metadata: { language: 'sargam-v1' }, source: ['#voice melody', 'S R G M'] };

    const newCells = [...notebook.cells];
    newCells.splice(index + 1, 0, newCell);
    setNotebook({ ...notebook, cells: newCells });
  };

  const deleteCell = (index) => {
    if (!notebook) return;
    const newCells = [...notebook.cells];
    newCells.splice(index, 1);
    setNotebook({ ...notebook, cells: newCells });
  };

  if (!notebook) return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <Sidebar
        files={files}
        activeFile={filePath}
        onFileSelect={setFilePath}
        theme={theme}
        setTheme={setTheme}
      />
      <main className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Music2 className="absolute inset-0 m-auto w-5 h-5 text-primary opacity-50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Loading workspace...</p>
        </div>
      </main>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/10">
      <Sidebar
        files={files}
        activeFile={filePath}
        onFileSelect={setFilePath}
        theme={theme}
        setTheme={setTheme}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-muted/5">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8 sticky top-0 z-10 shrink-0 shadow-sm">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <FileMusic className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 group max-w-fit">
                {isEditingTitle ? (
                  <input
                    type="text"
                    value={notebook.metadata?.title || ''}
                    onChange={(e) => setNotebook({
                      ...notebook,
                      metadata: { ...notebook.metadata, title: e.target.value }
                    })}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                    autoFocus
                    className="bg-transparent border-none p-0 font-bold text-xl outline-none focus:ring-0 w-full"
                  />
                ) : (
                  <>
                    <h3
                      onDoubleClick={() => setIsEditingTitle(true)}
                      className="font-bold text-xl truncate cursor-text hover:text-primary transition-colors"
                    >
                      {notebook.metadata?.title || 'Untitled Notebook'}
                    </h3>
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-all shrink-0"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate">{filePath}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveNotebook}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-all shadow-sm active:scale-95"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <Separator.Root orientation="vertical" className="h-4 bg-border w-[1px] mx-1" />
            <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <ScrollArea.Root className="flex-1 overflow-hidden h-full">
          <ScrollArea.Viewport className="h-full w-full">
            <div className="max-w-4xl mx-auto py-12 px-8">
              <div className="">
                {notebook.cells.map((cell, idx) => (
                  <div key={idx} className="relative">
                    <Cell
                      cell={cell}
                      theme={theme}
                      onChange={(newCell) => {
                        const newCells = [...notebook.cells];
                        newCells[idx] = newCell;
                        setNotebook({ ...notebook, cells: newCells });
                      }}
                      onDelete={() => deleteCell(idx)}
                    />
                    <AddCellControls onAdd={(type) => addCell(type, idx)} />
                  </div>
                ))}

                {notebook.cells.length === 0 && (
                  <div className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-muted-foreground gap-4">
                    <Layout className="w-12 h-12 opacity-20" />
                    <div className="text-center">
                      <p className="font-medium">No cells in this notebook</p>
                      <p className="text-sm">Add a cell to start creating music</p>
                    </div>
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => addCell('music', -1)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Music Cell
                      </button>
                      <button
                        onClick={() => addCell('markdown', -1)}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-bold hover:bg-muted transition-all border border-border"
                      >
                        <Plus className="w-4 h-4" />
                        Markdown Cell
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-[160ms] ease-out hover:bg-muted w-2.5" orientation="vertical">
            <ScrollArea.Thumb className="flex-1 bg-muted-foreground/30 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </main>
      <Toaster position="bottom-right" theme={theme} closeButton />
    </div>
  );
}

function AddCellControls({ onAdd }) {
  return (
    <div className="flex justify-center items-center h-8 relative group my-2">
      <div className="absolute inset-x-0 h-px bg-border/50 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-10">
        <button
          onClick={() => onAdd('music')}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-muted transition-all shadow-sm"
        >
          <Plus className="w-3 h-3" />
          Music
        </button>
        <button
          onClick={() => onAdd('markdown')}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-muted transition-all shadow-sm"
        >
          <Plus className="w-3 h-3" />
          Markdown
        </button>
      </div>
    </div>
  );
}

function Cell({ cell, onChange, onDelete, theme }) {
  const isMusic = cell.cell_type === 'music';

  return (
    <div className="group/cell relative bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300">
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isMusic ? <Music2 className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            {cell.cell_type}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover/cell:opacity-100 p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md transition-all shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-0">
        {isMusic ? (
          <MusicCell
            cell={cell}
            theme={theme}
            onChange={onChange}
          />
        ) : (
          <MarkdownCell
            cell={cell}
            theme={theme}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  );
}

function MarkdownCell({ cell, onChange, theme }) {
  const [editing, setEditing] = useState(false);
  const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;

  const handleChange = (val) => {
    onChange({ ...cell, source: val.split('\n') });
  };

  if (editing) {
    return (
      <div className="p-1 overflow-hidden">
        <CodeMirror
          value={content}
          minHeight="100px"
          extensions={[markdown()]}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          autoFocus={true}
          theme={theme}
          className="rounded-lg overflow-hidden border-none text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className="p-6 cursor-text min-h-[80px]"
      onDoubleClick={() => setEditing(true)}
    >
      <div className={cn(
        "prose prose-sm max-w-none prose-headings:font-bold prose-p:text-muted-foreground/90 prose-p:leading-relaxed",
        theme === 'dark' && "prose-invert"
      )}>
        <Markdown>{content || '*Double click to edit cell...*'}</Markdown>
      </div>
    </div>
  );
}

function MusicCell({ cell, onChange, theme }) {
  const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;
  const [isPlaying, setIsPlaying] = useState(false);

  const handleChange = (val) => {
    onChange({ ...cell, source: val.split('\n') });
  };

  const handlePlay = async () => {
    if (isPlaying) {
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      setIsPlaying(false);
      return;
    }

    await Tone.start();

    try {
      const res = await fetch(`${API_BASE}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: content.split('\n') }),
      });
      if (!res.ok) throw new Error('Parse error');
      const data = await res.json();

      playMusic(data);
      setIsPlaying(true);
    } catch (e) {
      console.error(e);
      toast.error('Could not parse musical notation');
    }
  };

  const playMusic = (parsedData) => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    const membrane = new Tone.MembraneSynth().toDestination();

    let SA_FREQ = 261.63;
    const directives = parsedData.directives || {};
    const tonicSpec = directives.sa || directives.tonic;

    if (tonicSpec) {
      try {
        const freq = Tone.Frequency(tonicSpec).toFrequency();
        if (!isNaN(freq) && freq > 0) SA_FREQ = freq;
      } catch (e) {
        console.warn("Invalid tonic:", tonicSpec);
      }
    }

    const scales = {
      'S': 0, 'r': 1, 'R': 2, 'g': 3, 'G': 4, 'm': 5, 'M': 6, 'P': 7, 'd': 8, 'D': 9, 'n': 10, 'N': 11
    };

    const bpm = directives.tempo ? parseFloat(directives.tempo) : 120;
    Tone.getTransport().bpm.value = bpm;

    let maxDuration = 0;
    if (directives.tala) {
      Tone.getTransport().scheduleRepeat((time) => {
        membrane.triggerAttackRelease("C2", "8n", time);
      }, "4n");
    }

    Object.values(parsedData.voices).forEach(voice => {
      let time = 0;
      const beatDur = 60 / bpm;

      voice.events.forEach(event => {
        if (event.duration) {
          const durSeconds = event.duration * beatDur;
          if (event.swara) {
            let semitones = scales[event.swara] || 0;
            if (event.variant === 'k' || event.variant === 'b') semitones -= 1;
            if (event.variant === 't' || event.variant === '#') semitones += 1;
            semitones += (event.octave || 0) * 12;

            const freq = SA_FREQ * Math.pow(2, semitones / 12);
            Tone.getTransport().schedule((t) => {
              synth.triggerAttackRelease(freq, durSeconds, t);
            }, time);
          }
          time += durSeconds;
        }
      });
      if (time > maxDuration) maxDuration = time;
    });

    Tone.getTransport().start();
    Tone.getTransport().schedule((time) => {
      Tone.getTransport().stop();
      setIsPlaying(false);
    }, maxDuration + 1);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-b border-border">
        <button
          onClick={handlePlay}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95",
            isPlaying
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isPlaying ? (
            <><Square className="w-3 h-3 fill-current" /> Stop</>
          ) : (
            <><Play className="w-3 h-3 fill-current" /> Play</>
          )}
        </button>
      </div>
      <div className="p-1">
        <CodeMirror
          value={content}
          height="auto"
          extensions={[markdown()]}
          onChange={handleChange}
          theme={theme}
          className="text-sm font-mono focus-within:ring-0"
        />
      </div>
    </div>
  );
}

export default App;
