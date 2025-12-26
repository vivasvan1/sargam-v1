import React from "react";
import { Music2, ChevronRight, Trash2 } from "lucide-react";
import { MusicCell } from "./MusicCell";
import { MarkdownCell } from "./MarkdownCell";

export function Cell({ cell, onChange, onDelete, theme }) {
  const isMusic = cell.cell_type === "music";

  return (
    <div className="group/cell relative bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300 max-w-full h-full">
      <div className="px-3 md:px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isMusic ? (
            <Music2 className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" />
          )}
          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground truncate">
            {cell.cell_type}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="opacity-100 md:opacity-0 md:group-hover/cell:opacity-100 p-2 md:p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md transition-all shrink-0 active:scale-95 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center touch-manipulation ml-2"
          aria-label="Delete cell"
        >
          <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
        </button>
      </div>

      <div className="p-0 overflow-x-auto max-w-full">
        {isMusic ? (
          <MusicCell cell={cell} theme={theme} onChange={onChange} />
        ) : (
          <MarkdownCell cell={cell} theme={theme} onChange={onChange} />
        )}
      </div>
    </div>
  );
}
