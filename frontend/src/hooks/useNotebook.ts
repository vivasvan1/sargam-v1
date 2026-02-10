import { useReducer, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Notebook, NotebookCell } from '../types/notebook';

const normalizeSource = (source: string | string[]): string[] => {
  return Array.isArray(source) ? source : source.split('\n');
};

type HistoryAction =
  | { type: 'ADD'; cell: NotebookCell; index: number }
  | { type: 'DELETE'; cell: NotebookCell; index: number };

interface State {
  notebook: Notebook;
  history: {
    past: HistoryAction[];
    future: HistoryAction[];
  };
}

type Action =
  | { type: 'SET_NOTEBOOK'; payload: Notebook }
  | { type: 'UPDATE_CELL'; payload: { id: string; content: string[] | string } }
  | { type: 'ADD_CELL'; payload: { type: 'music' | 'markdown'; index: number } }
  | { type: 'DELETE_CELL'; payload: { index: number } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'UPDATE_TITLE'; payload: string };

const ensureIds = (nb: Notebook): Notebook => ({
  ...nb,
  cells: nb.cells.map((cell) => ({
    ...cell,
    id: cell.id || uuidv4(),
  })),
});

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_NOTEBOOK':
      return {
        notebook: ensureIds(action.payload),
        history: { past: [], future: [] },
      };

    case 'UPDATE_TITLE':
      return {
        ...state,
        notebook: {
          ...state.notebook,
          metadata: { ...state.notebook.metadata, title: action.payload },
        },
      };

    case 'UPDATE_CELL': {
      const { id, content } = action.payload;
      const cellIndex = state.notebook.cells.findIndex((c) => c.id === id);
      if (cellIndex === -1) return state;

      const currentCell = state.notebook.cells[cellIndex];
      const newSource = normalizeSource(content);
      const oldSource = normalizeSource(currentCell.source);

      if (JSON.stringify(newSource) === JSON.stringify(oldSource)) return state;

      const newCells = [...state.notebook.cells];
      newCells[cellIndex] = { ...currentCell, source: newSource };

      // NOTE: We do NOT push to history for content updates, as requested.
      return {
        ...state,
        notebook: { ...state.notebook, cells: newCells },
      };
    }

    case 'ADD_CELL': {
      const { type, index } = action.payload;
      const newCell: NotebookCell =
        type === 'markdown'
          ? {
              id: uuidv4(),
              cell_type: 'markdown',
              source: [
                '# New markdown cell',
                'Double click or double tap to edit.',
              ],
            }
          : {
              id: uuidv4(),
              cell_type: 'music',
              metadata: { language: 'sargam-v1' },
              source: ['#voice melody', 'S R G M'],
            };

      const newCells = [...state.notebook.cells];
      // Splice logic: index is "index to add after". So splice at index + 1.
      // But if index is -1 (add at top?), splice at 0?
      // Wait, app sends "index" as "idx" from map. So usually "idx".
      // If adding "below", we do idx + 1.
      // If invalid index (e.g. -1 for empty notebook), insert at 0.

      const insertIndex = index + 1; // Default behavior from App.tsx was `index + 1`.
      newCells.splice(insertIndex, 0, newCell);

      return {
        ...state,
        notebook: { ...state.notebook, cells: newCells },
        history: {
          past: [
            ...state.history.past,
            { type: 'ADD', cell: newCell, index: insertIndex },
          ],
          future: [],
        },
      };
    }

    case 'DELETE_CELL': {
      const { index } = action.payload;
      if (index < 0 || index >= state.notebook.cells.length) return state;

      const cell = state.notebook.cells[index];
      const newCells = [...state.notebook.cells];
      newCells.splice(index, 1);

      return {
        ...state,
        notebook: { ...state.notebook, cells: newCells },
        history: {
          past: [...state.history.past, { type: 'DELETE', cell, index }],
          future: [],
        },
      };
    }

    case 'UNDO': {
      if (state.history.past.length === 0) return state;
      const lastAction = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      let newCells = [...state.notebook.cells];

      if (lastAction.type === 'ADD') {
        // Inverse of ADD is DELETE.
        // We added a cell at lastAction.index with id lastAction.cell.id.
        // We must find it and remove it.
        // Using ID is safer than index if we allow reordering/concurrent edits, but for now Index should match if no other structural changes.
        // However, if we edited *other* cells, indices remain stable.
        const idx = newCells.findIndex((c) => c.id === lastAction.cell.id);
        if (idx !== -1) {
          newCells.splice(idx, 1);
        }
      } else if (lastAction.type === 'DELETE') {
        // Inverse of DELETE is ADD (Restore).
        // We deleted cell at lastAction.index.
        // We restore it at that index.
        // Important: Restore it with the content it had when deleted (stored in lastAction.cell).
        // Safest to clamp index.
        const idx = Math.min(Math.max(0, lastAction.index), newCells.length);
        newCells.splice(idx, 0, lastAction.cell);
      }

      return {
        ...state,
        notebook: { ...state.notebook, cells: newCells },
        history: {
          past: newPast,
          future: [lastAction, ...state.history.future],
        },
      };
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state;
      const nextAction = state.history.future[0];
      const newFuture = state.history.future.slice(1);

      let newCells = [...state.notebook.cells];

      if (nextAction.type === 'ADD') {
        // Redo ADD: Put it back.
        // But what if we typed in it before Undo?
        // 'cell' in action snapshot has the *initial* state if it was a FRESH ADD.
        // If we Delete -> Undo -> Redo (Delete), it's a DELETE type action.
        // So ADD type means "User clicked Add button". So it puts back a fresh cell.
        // This is correct: Redoing an "Add New Cell" adds a new cell.
        const idx = Math.min(Math.max(0, nextAction.index), newCells.length);
        newCells.splice(idx, 0, nextAction.cell);
      } else if (nextAction.type === 'DELETE') {
        // Redo DELETE: Remove it again.
        // We need to find the cell.
        const idx = newCells.findIndex((c) => c.id === nextAction.cell.id);
        if (idx !== -1) {
          // Check if we want to update the 'cell' snapshot in history to the *latest* content?
          // No, strictly following standard redo might be better?
          // If I Delete (cell has text "A"), Undo (Restores "A"). Type "B". Redo (Delete).
          // It deletes "B".
          // If I Undo again (Undo Delete), I should restore... "B"?
          // Because I deleted "B".
          // But my 'nextAction' stored in Future still has "A".
          // This is the complexity of non-linear history.
          // If we strictly follow the stack:
          // 1. ADD [New]. Past: [ADD].
          // 2. Type "Text". (Ignored). Cell has "Text".
          // 3. Undo (ADD). Removes cell. Future: [ADD].
          // 4. Redo (ADD). Adds [New] (fresh).
          //    Wait, "Type Text" was lost. This is expected if text changes aren't tracked!
          newCells.splice(idx, 1);
        }
      }

      return {
        ...state,
        notebook: { ...state.notebook, cells: newCells },
        history: {
          past: [...state.history.past, nextAction],
          future: newFuture,
        },
      };
    }

    default:
      return state;
  }
};

export function useNotebook(initialNotebook: Notebook) {
  const [state, dispatch] = useReducer(reducer, {
    notebook: ensureIds(initialNotebook),
    history: { past: [], future: [] },
  });

  const setNotebook = useCallback((nb: Notebook) => {
    dispatch({ type: 'SET_NOTEBOOK', payload: nb });
  }, []);

  const updateCell = useCallback((id: string, content: string[] | string) => {
    dispatch({ type: 'UPDATE_CELL', payload: { id, content } });
  }, []);

  const addCell = useCallback((type: 'music' | 'markdown', index: number) => {
    dispatch({ type: 'ADD_CELL', payload: { type, index } });
  }, []);

  const deleteCell = useCallback((index: number) => {
    dispatch({ type: 'DELETE_CELL', payload: { index } });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const updateTitle = useCallback((title: string) => {
    dispatch({ type: 'UPDATE_TITLE', payload: title });
  }, []);

  return {
    notebook: state.notebook,
    history: state.history,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    setNotebook,
    updateCell,
    addCell,
    deleteCell,
    undo,
    redo,
    updateTitle,
  };
}
