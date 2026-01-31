import { create } from 'zustand';

interface NotebookState {
    notebook: any | null;
    metadata: any | null; // GoogleFile
    fileId: string | null;
    isReadOnly: boolean;
    isPublished: boolean;

    // Actions
    setNotebook: (notebook: any, fileId: string | null, metadata: any | null, isReadOnly: boolean, isPublished: boolean) => void;
    updateMetadata: (metadata: any) => void;
    setPublished: (isPublished: boolean) => void;
    setReadOnly: (isReadOnly: boolean) => void;
    reset: () => void;
}

export const useNotebookStore = create<NotebookState>((set) => ({
    notebook: null,
    metadata: null,
    fileId: null,
    isReadOnly: false,
    isPublished: false,

    setNotebook: (notebook, fileId, metadata, isReadOnly, isPublished) => set({
        notebook,
        fileId,
        metadata,
        isReadOnly,
        isPublished
    }),

    updateMetadata: (metadata) => set({ metadata }),
    setPublished: (isPublished) => set({ isPublished }),
    setReadOnly: (isReadOnly) => set({ isReadOnly }),
    reset: () => set({ notebook: null, metadata: null, fileId: null, isReadOnly: false, isPublished: false })
}));
