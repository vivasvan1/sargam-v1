import React from "react";
import { ScrollArea } from "./ui/scroll-area";
import { Cell } from "./Cell";
import { AddCellControls } from "./AddCellControls";
import { EmptyState } from "./EmptyState";
import { GoogleAd } from "./GoogleAd";
import type { Notebook } from "../types/notebook";

interface NotebookEditorProps {
    notebook: Notebook;
    activeCellId: string | null;
    setActiveCellId: (id: string | null) => void;
    updateCell: (id: string, source: string) => void;
    deleteCell: (index: number) => void;
    addCell: (type: "music" | "markdown", index: number) => void;
    theme: "light" | "dark" | "system";
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
    return (
        <ScrollArea className="flex-1 overflow-hidden h-full">
            <div className="max-w-4xl mx-auto py-6 md:py-12 px-4 md:px-8 w-full min-w-0">
                {/* <GoogleAd slot="top-banner" /> */}
                <div className="w-full min-w-0">
                    {notebook.cells.map((cell, idx) => (
                        <div key={cell.id} className="relative">
                            <div
                                className={`${activeCellId === cell.id
                                    ? "ring-2 ring-primary ring-offset-2 rounded-xl"
                                    : ""
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
                            onAddMusic={() => addCell("music", -1)}
                            onAddMarkdown={() => addCell("markdown", -1)}
                        />
                    )}
                </div>
                {/* <GoogleAd slot="bottom-banner" /> */}
            </div>
        </ScrollArea>
    );
};
