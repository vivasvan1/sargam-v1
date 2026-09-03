import React, { useEffect, useRef } from 'react';
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
  isReadOnly?: boolean;
  isAutoScrolling: boolean;
  autoScrollSpeed: number;
  setIsAutoScrolling: (isAutoScrolling: boolean) => void;
  toggleAutoScroll: () => void;
}

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  notebook,
  activeCellId,
  setActiveCellId,
  updateCell,
  deleteCell,
  addCell,
  theme,
  isReadOnly = false,
  isAutoScrolling,
  autoScrollSpeed,
  setIsAutoScrolling,
  toggleAutoScroll,
}) => {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const lastUserScrollTimeRef = useRef(0);
  const autoScrollTopRef = useRef<number | null>(null);
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

  useEffect(() => {
    const root = scrollRootRef.current;
    const viewport = root?.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]'
    );

    if (!isAutoScrolling || !viewport) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
      autoScrollTopRef.current = null;
      return;
    }

    const previousScrollBehavior = viewport.style.scrollBehavior;
    viewport.style.scrollBehavior = 'auto';
    autoScrollTopRef.current = viewport.scrollTop;

    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsedSeconds = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;
      const isUserScrolling = timestamp - lastUserScrollTimeRef.current < 1200;

      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      if (autoScrollTopRef.current === null || isUserScrolling) {
        autoScrollTopRef.current = viewport.scrollTop;
      }

      const nextScrollTop = Math.min(
        autoScrollTopRef.current +
          (isUserScrolling ? 0 : autoScrollSpeed * elapsedSeconds),
        maxScrollTop
      );

      autoScrollTopRef.current = nextScrollTop;
      viewport.scrollTop = nextScrollTop;

      if (nextScrollTop >= maxScrollTop) {
        setIsAutoScrolling(false);
        animationFrameRef.current = null;
        lastFrameTimeRef.current = null;
        autoScrollTopRef.current = null;
        return;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
      autoScrollTopRef.current = null;
      viewport.style.scrollBehavior = previousScrollBehavior;
    };
  }, [autoScrollSpeed, isAutoScrolling, setIsAutoScrolling]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const viewport = root?.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]'
    );

    if (!viewport) return;

    const handleUserScroll = () => {
      lastUserScrollTimeRef.current = performance.now();
    };

    viewport.addEventListener('wheel', handleUserScroll, { passive: true });
    viewport.addEventListener('touchstart', handleUserScroll, {
      passive: true,
    });
    viewport.addEventListener('touchmove', handleUserScroll, { passive: true });
    viewport.addEventListener('pointerdown', handleUserScroll, {
      passive: true,
    });

    return () => {
      viewport.removeEventListener('wheel', handleUserScroll);
      viewport.removeEventListener('touchstart', handleUserScroll);
      viewport.removeEventListener('touchmove', handleUserScroll);
      viewport.removeEventListener('pointerdown', handleUserScroll);
    };
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      return Boolean(
        target.closest(
          [
            'input',
            'textarea',
            'select',
            'button',
            '[contenteditable="true"]',
            '[role="button"]',
            '[role="menu"]',
            '[role="menuitem"]',
            '[role="dialog"]',
            '.cm-editor',
          ].join(',')
        )
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== ' ') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      toggleAutoScroll();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleAutoScroll]);

  return (
    <ScrollArea ref={scrollRootRef} className="flex-1 overflow-hidden h-full">
      <div className="mx-auto py-6 md:py-12 px-4 md:px-12 w-full min-w-0">
        {/* <GoogleAd slot="top-banner" /> */}
        <div className="w-full min-w-0">
          {notebook.cells.map((cell, idx) => (
            <div
              key={cell.id}
              id={`cell-${cell.id}`}
              className="relative mb-4 scroll-mt-20 last:mb-0 md:mb-6"
            >
              <Cell
                cell={cell}
                theme={theme}
                onChange={(newCell) => {
                  if (isReadOnly) return;
                  updateCell(cell.id, newCell.source);
                }}
                onDelete={() => {
                  if (isReadOnly) return;
                  deleteCell(idx);
                }}
                onFocus={() => setActiveCellId(cell.id)}
              />

              {!isReadOnly && (
                <AddCellControls onAdd={(type) => addCell(type, idx)} />
              )}
            </div>
          ))}

          {notebook.cells.length === 0 && !isReadOnly && (
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
              made with <span className="inline-block">❤️</span> in India
            </p>
            <div className="flex gap-4">
              <a
                href="https://experts.speede.site/licenses/privacy"
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="https://experts.speede.site/licenses/terms"
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
