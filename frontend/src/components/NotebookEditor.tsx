import React, { useEffect } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Cell } from './Cell';
import { AddCellControls } from './AddCellControls';
import { EmptyState } from './EmptyState';
import type { Notebook } from '../types/notebook';

interface NotebookEditorProps {
  notebook: Notebook;
  activeCellId: string | null;
  setActiveCellId: (id: string | null) => void;
  updateCell: (id: string, source: string) => void;
  deleteCell: (index: number) => void;
  addCell: (type: 'music' | 'markdown', index: number) => void;
  theme: 'light' | 'dark' | 'system';
}

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  notebook,
  activeCellId,
  setActiveCellId,
  updateCell,
  deleteCell,
  addCell,
  theme,
}) => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const scrollCellId = urlParams.get('cellId');

    if (scrollCellId && notebook.cells.length > 0) {
      // Use a small timeout to ensure rendering is complete
      const timer = setTimeout(() => {
        const element = document.getElementById(`cell-${scrollCellId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveCellId(scrollCellId);

          // Remove cellId from URL to prevent re-triggering
          const url = new URL(window.location.href);
          if (url.searchParams.has('cellId')) {
            url.searchParams.delete('cellId');
            window.history.replaceState({}, '', url.toString());
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [notebook.cells.length, setActiveCellId]);

  return (
    <ScrollArea className="flex-1 overflow-hidden h-full">
      <div className="max-w-4xl mx-auto py-6 md:py-12 px-4 md:px-8 w-full min-w-0">
        {/* <GoogleAd slot="top-banner" /> */}
        <div className="w-full min-w-0">
          {notebook.cells.map((cell, idx) => (
            <div
              key={cell.id}
              id={`cell-${cell.id}`}
              className="relative scroll-mt-20"
            >
              <div
                className={`${
                  activeCellId === cell.id
                    ? 'ring-2 ring-primary ring-offset-2 rounded-xl'
                    : ''
                }`}
              >
                <Cell
                  cell={cell}
                  theme={theme}
                  onChange={(newCell) => {
                    updateCell(cell.id, newCell.source);
                  }}
                  onDelete={() => deleteCell(idx)}
                  onFocus={() => setActiveCellId(cell.id)}
                />
              </div>
              <AddCellControls onAdd={(type) => addCell(type, idx)} />
            </div>
          ))}

          {notebook.cells.length === 0 && (
            <EmptyState
              onAddMusic={() => addCell('music', -1)}
              onAddMarkdown={() => addCell('markdown', -1)}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 py-6 border-t border-muted-foreground/20 text-center text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <p>
              made with <span className="inline-block animate-pulse">❤️</span>{' '}
              in India
            </p>
            <div className="flex gap-4">
              <a
                href="/privacy-policy"
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="/terms-and-conditions"
                className="hover:text-primary transition-colors"
              >
                Terms and Conditions
              </a>
            </div>
          </div>
        </footer>

        {/* <GoogleAd slot="bottom-banner" /> */}
      </div>
    </ScrollArea>
  );
};
