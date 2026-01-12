import React, { createContext, useContext, useState, type ReactNode } from "react";

interface NotebookSettingsContextType {
    defaultInstruments: Record<string, string>;
    updateDefaultInstrument: (voiceName: string, instrumentId: string) => void;
    showVisualizer: boolean;
    toggleVisualizer: () => void;
    showCode: boolean;
    toggleCode: () => void;
}

const NotebookSettingsContext = createContext<NotebookSettingsContextType | undefined>(undefined);

export function NotebookSettingsProvider({ children }: { children: ReactNode }) {
    const [defaultInstruments, setDefaultInstruments] = useState<Record<string, string>>({
        default: "sitar-sampler",
    });
    const [showVisualizer, setShowVisualizer] = useState(true);
    const [showCode, setShowCode] = useState(false);

    const toggleVisualizer = () => setShowVisualizer(prev => !prev);
    const toggleCode = () => setShowCode(prev => !prev);

    const updateDefaultInstrument = (voiceName: string, instrumentId: string) => {
        setDefaultInstruments((prev) => ({
            ...prev,
            [voiceName]: instrumentId,
        }));
    };

    return (
        <NotebookSettingsContext.Provider value={{ defaultInstruments, updateDefaultInstrument, showVisualizer, toggleVisualizer, showCode, toggleCode }}>
            {children}
        </NotebookSettingsContext.Provider>
    );
}

export function useNotebookSettings() {
    const context = useContext(NotebookSettingsContext);
    if (context === undefined) {
        throw new Error("useNotebookSettings must be used within a NotebookSettingsProvider");
    }
    return context;
}
