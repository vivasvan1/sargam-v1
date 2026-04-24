import { create } from 'zustand';

interface PlaybackState {
    activeCellId: string | null;
    stopPlayback: (() => void) | null;
    setActiveCell: (id: string, stopFn: () => void) => void;
    clearActiveCell: (id: string) => void;
    
    cellControllers: Record<string, () => Promise<boolean>>;
    registerCellController: (id: string, playFn: () => Promise<boolean>) => void;
    unregisterCellController: (id: string) => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
    activeCellId: null,
    stopPlayback: null,
    cellControllers: {},

    setActiveCell: (id, stopFn) => {
        const currentState = get();

        // If there's an active cell and it's not the one we're starting, stop it
        if (currentState.activeCellId && currentState.activeCellId !== id && currentState.stopPlayback) {
            try {
                currentState.stopPlayback();
            } catch (e) {
                console.error('Error stopping previous cell:', e);
            }
        }

        set({
            activeCellId: id,
            stopPlayback: stopFn,
        });
    },

    clearActiveCell: (id) => {
        const currentState = get();
        if (currentState.activeCellId === id) {
            set({
                activeCellId: null,
                stopPlayback: null,
            });
        }
    },

    registerCellController: (id, playFn) => {
        set((state) => ({
            cellControllers: {
                ...state.cellControllers,
                [id]: playFn,
            }
        }));
    },

    unregisterCellController: (id) => {
        set((state) => {
            const next = { ...state.cellControllers };
            delete next[id];
            return { cellControllers: next };
        });
    }
}));
