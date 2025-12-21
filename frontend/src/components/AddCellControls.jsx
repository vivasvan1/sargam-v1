import React from 'react';
import { Plus } from "lucide-react";

export function AddCellControls({ onAdd }) {
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
