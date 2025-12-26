import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import './App.css';

// Components
import { Cell } from './components/Cell';
import { AddCellControls } from './components/AddCellControls';

// Libs
import { toast, Toaster } from 'sonner';
import * as Separator from '@radix-ui/react-separator';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import {
  Save,
  Plus,
  FileMusic,
  Pencil,
  Music2,
  Layout,
  MoreHorizontal,
  Download,
  Menu,
  X
} from "lucide-react";

// Load default notebook
const loadDefaultNotebook = async () => {
  try {
    const response = await fetch('/raag_khamaj_demo.imnb');
    if (response.ok) {
      const content = await response.json();
      return content;
    }
  } catch (err) {
    console.error('Failed to load default notebook', err);
  }
  // Fallback to empty notebook
  return {
    imnb_version: 1,
    metadata: { title: 'New Notebook' },
    cells: []
  };
};

function App() {
  const [notebook, setNotebook] = useState({
    imnb_version: 1,
    metadata: { title: 'New Notebook' },
    cells: []
  });
  const [filePath, setFilePath] = useState('raag_khamaj_demo.imnb');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sargam-theme') || 'light';
  });

  // Load default notebook on mount
  useEffect(() => {
    loadDefaultNotebook().then(defaultNotebook => {
      setNotebook(defaultNotebook);
      if (defaultNotebook.metadata?.title) {
        setFilePath('raag_khamaj_demo.imnb');
      }
    });
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

  const saveNotebook = () => {
    handleDownload();
  };

  const handleNew = () => {
    if (window.confirm('Start a new notebook? Unsaved changes will be lost.')) {
      setNotebook({
        imnb_version: 1,
        metadata: { title: 'New Notebook' },
        cells: []
      });
      setFilePath('untitled.imnb');
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target.result);
        setNotebook(content);
        setFilePath(file.name);
        toast.success(`Loaded ${file.name}`);
      } catch (err) {
        console.error("Malformed IMNB file", err);
        toast.error("Invalid .imnb file format");
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!notebook) return;
    const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filePath.endsWith('.imnb') ? filePath : `${filePath}.imnb`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Notebook downloaded');
  };

  const addCell = (type, index) => {
    if (!notebook) return;
    const newCell = type === 'markdown'
      ? { cell_type: 'markdown', source: ['# New markdown cell\nDouble click or double tap to edit.'] }
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


  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/10">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        onFileUpload={handleFileUpload}
        onNew={handleNew}
        theme={theme}
        setTheme={setTheme}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-muted/5">
        {/* Header */}
        <header className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0 shadow-sm">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground shrink-0"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <div className="hidden md:flex w-10 h-10 rounded-xl bg-muted items-center justify-center text-muted-foreground shrink-0">
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
                    className="bg-transparent border-none p-0 font-bold text-base md:text-xl outline-none focus:ring-0 w-full"
                  />
                ) : (
                  <>
                    <h3
                      onDoubleClick={() => setIsEditingTitle(true)}
                      className="font-bold text-base md:text-xl truncate cursor-text hover:text-primary transition-colors"
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
              <p className="text-xs text-muted-foreground font-mono truncate hidden md:block">{filePath}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-primary text-primary-foreground rounded-lg text-xs md:text-sm font-medium hover:opacity-90 transition-all shadow-sm active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <Separator.Root orientation="vertical" className="hidden md:block h-4 bg-border w-px mx-1" />
            <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hidden md:flex">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <ScrollArea.Root className="flex-1 overflow-hidden h-full">
          <ScrollArea.Viewport className="h-full w-full min-w-0">
            <div className="max-w-4xl mx-auto py-6 md:py-12 px-4 md:px-8 w-full min-w-0">
              <div className="w-full min-w-0">
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
                  <div className="border-2 border-dashed border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center text-muted-foreground gap-4">
                    <Layout className="w-10 h-10 md:w-12 md:h-12 opacity-20" />
                    <div className="text-center">
                      <p className="font-medium text-sm md:text-base">No cells in this notebook</p>
                      <p className="text-xs md:text-sm">Add a cell to start creating music</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
                      <button
                        onClick={() => addCell('music', -1)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-sm active:scale-95 min-h-[44px]"
                      >
                        <Plus className="w-4 h-4" />
                        Music Cell
                      </button>
                      <button
                        onClick={() => addCell('markdown', -1)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-bold hover:bg-muted transition-all border border-border active:scale-95 min-h-[44px]"
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
          <ScrollArea.Scrollbar className="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-160 ease-out hover:bg-muted w-2.5" orientation="vertical">
            <ScrollArea.Thumb className="flex-1 bg-muted-foreground/30 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </main>
      <Toaster position="bottom-right" theme={theme} closeButton />
    </div>
  );
}


export default App;
