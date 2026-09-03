import { create } from 'zustand';
import * as Tone from 'tone';

interface PlaybackState {
    activeCellId: string | null;
    stopPlayback: (() => void) | null;
    setActiveCell: (id: string, stopFn: () => void) => void;
    clearActiveCell: (id: string) => void;
    
    cellControllers: Record<string, (startTime?: number) => Promise<boolean>>;
    registerCellController: (id: string, playFn: (startTime?: number) => Promise<boolean>) => void;
    unregisterCellController: (id: string) => void;

    isPlayingAll: boolean;
    allMusicCellIds: string[];
    setAllMusicCellIds: (ids: string[]) => void;
    startPlayAll: (cellIds?: string[], startCellId?: string, startTime?: number) => Promise<void>;
    stopPlayAll: () => void;
    seekPlayAll: (cellId: string, startTime?: number) => void;
}

let currentPlayAllSession = 0;
let pendingSeekTarget: { cellId: string; startTime?: number } | null = null;

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
    activeCellId: null,
    stopPlayback: null,
    cellControllers: {},
    isPlayingAll: false,
    allMusicCellIds: [],

    setAllMusicCellIds: (ids) => {
        set({ allMusicCellIds: ids });
    },

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
    },

    startPlayAll: async (cellIds?: string[], startCellId?: string, startTime?: number) => {
        currentPlayAllSession++;
        const thisSession = currentPlayAllSession;

        const ids = cellIds ?? get().allMusicCellIds;
        if (!ids || ids.length === 0) {
            set({ isPlayingAll: false });
            return;
        }

        set({ isPlayingAll: true, allMusicCellIds: ids });

        let currentIndex = 0;
        if (startCellId) {
            const foundIndex = ids.indexOf(startCellId);
            if (foundIndex !== -1) {
                currentIndex = foundIndex;
            }
        }

        let nextStartTime: number | undefined = startTime;

        while (currentPlayAllSession === thisSession && currentIndex < ids.length) {
            const currentIds = get().allMusicCellIds;
            if (currentIndex >= currentIds.length) break;

            const cellId = currentIds[currentIndex];
            const playFn = get().cellControllers[cellId];

            if (!playFn) {
                currentIndex++;
                nextStartTime = undefined;
                continue;
            }

            const timeToStart = nextStartTime;
            nextStartTime = undefined;
            pendingSeekTarget = null;

            try {
                const cellElement = document.getElementById(`cell-${cellId}`);
                cellElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch {
                /* ignore */
            }

            const isNatural = await playFn(timeToStart);

            if (currentPlayAllSession !== thisSession) {
                break;
            }

            if (pendingSeekTarget) {
                const target = pendingSeekTarget;
                pendingSeekTarget = null;
                const targetIdx = currentIds.indexOf(target.cellId);
                if (targetIdx !== -1) {
                    currentIndex = targetIdx;
                    nextStartTime = target.startTime;
                    continue;
                }
            }

            if (!isNatural) {
                break;
            }

            currentIndex++;
        }

        if (currentPlayAllSession === thisSession) {
            set({ isPlayingAll: false });
        }
    },

    stopPlayAll: () => {
        currentPlayAllSession++;
        pendingSeekTarget = null;
        const currentState = get();
        if (currentState.stopPlayback) {
            try {
                currentState.stopPlayback();
            } catch (e) {
                console.error('Error stopping playback on stopPlayAll:', e);
            }
        }
        set({ isPlayingAll: false });
    },

    seekPlayAll: (cellId: string, startTime?: number) => {
        const state = get();
        if (!state.isPlayingAll) {
            get().startPlayAll(undefined, cellId, startTime);
            return;
        }

        if (state.activeCellId === cellId) {
            if (startTime !== undefined) {
                try {
                    Tone.getTransport().seconds = startTime;
                } catch (e) {
                    console.error('Error seeking Tone transport:', e);
                }
            }
            return;
        }

        pendingSeekTarget = { cellId, startTime };
        if (state.stopPlayback) {
            try {
                state.stopPlayback();
            } catch (e) {
                console.error('Error stopping active cell on seekPlayAll:', e);
            }
        }
    },
}));
