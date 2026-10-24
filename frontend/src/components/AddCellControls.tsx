import React from 'react';
import { Plus, Mic } from 'lucide-react';
import { Button } from './ui/button';

interface AddCellControlsProps {
  onAdd: (type: 'music' | 'markdown') => void;
  onTranscribeAudio?: () => void;
}

export function AddCellControls({ onAdd, onTranscribeAudio }: AddCellControlsProps) {
  return (
    <div className="flex justify-center items-center min-h-[44px] relative my-2 md:my-1">
      <div className="absolute inset-x-0 h-px bg-border" />
      <div className="flex gap-3 md:gap-4 opacity-100 transition-all z-10">
        <Button
          onClick={() => onAdd('music')}
          variant="outline"
          size="sm"
          className="rounded-full text-[10px] font-bold uppercase tracking-wider min-h-[44px] md:min-h-0 touch-manipulation dark:bg-background dark:hover:bg-secondary"
          aria-label="Add music cell"
        >
          <Plus className="w-3.5 h-3.5 md:w-3 md:h-3" />
          Music
        </Button>
        <Button
          onClick={() => onAdd('markdown')}
          variant="outline"
          size="sm"
          className="rounded-full text-[10px] font-bold uppercase tracking-wider min-h-[44px] md:min-h-0 touch-manipulation dark:bg-background dark:hover:bg-secondary"
          aria-label="Add markdown cell"
        >
          <Plus className="w-3.5 h-3.5 md:w-3 md:h-3" />
          Markdown
        </Button>
        {onTranscribeAudio && (
          <Button
            onClick={onTranscribeAudio}
            variant="outline"
            size="sm"
            className="rounded-full text-[10px] font-bold uppercase tracking-wider min-h-[44px] md:min-h-0 touch-manipulation dark:bg-background dark:hover:bg-secondary text-primary border-primary/40 hover:bg-primary/10"
            aria-label="Transcribe audio"
          >
            <Mic className="w-3.5 h-3.5 md:w-3 md:h-3 text-primary" />
            From Audio
          </Button>
        )}
      </div>
    </div>
  );
}
