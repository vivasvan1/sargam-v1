import React from 'react';
import type { TranscribedNoteEvent } from '@/utils/audio/types';
import type { RagaDefinition } from '@/utils/audio/raga/ragaDefinitions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Volume2,
  Trash2,
  Split,
  X,
  Sparkles,
  ArrowRight,
  Music,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NoteInspectorProps {
  note: TranscribedNoteEvent;
  raga?: RagaDefinition;
  onUpdateNote: (updated: TranscribedNoteEvent) => void;
  onDeleteNote: (noteId: string) => void;
  onSplitNote: (noteId: string) => void;
  onAuditionSlice: (startSec: number, endSec: number) => void;
  onAuditionSynth: (note: TranscribedNoteEvent) => void;
  onClose: () => void;
}

const ALL_SWARAS = [
  { swara: 'S', label: 'Sa', isKomal: false },
  { swara: 'r', label: 're (k)', isKomal: true },
  { swara: 'R', label: 'Re', isKomal: false },
  { swara: 'g', label: 'ga (k)', isKomal: true },
  { swara: 'G', label: 'Ga', isKomal: false },
  { swara: 'm', label: 'ma', isKomal: false },
  { swara: 'Mt', label: 'Ma (t)', isKomal: false, isTivra: true },
  { swara: 'P', label: 'Pa', isPillar: true },
  { swara: 'd', label: 'dha (k)', isKomal: true },
  { swara: 'D', label: 'Dha', isKomal: false },
  { swara: 'n', label: 'ni (k)', isKomal: true },
  { swara: 'N', label: 'Ni', isKomal: false },
];

export const NoteInspector: React.FC<NoteInspectorProps> = ({
  note,
  raga,
  onUpdateNote,
  onDeleteNote,
  onSplitNote,
  onAuditionSlice,
  onAuditionSynth,
  onClose,
}) => {
  const allowedSet = raga && raga.id !== 'none' ? new Set(raga.allowedSwaras) : null;

  const handleSwaraChange = (swara: string) => {
    onUpdateNote({
      ...note,
      swara,
      manuallyEdited: true,
    });
  };

  const handleOctaveChange = (octave: number) => {
    onUpdateNote({
      ...note,
      octave,
      manuallyEdited: true,
    });
  };

  const handleOrnamentTypeChange = (type: 'none' | 'meend' | 'kan') => {
    if (type === 'none') {
      onUpdateNote({
        ...note,
        ornament: undefined,
        manuallyEdited: true,
      });
    } else {
      const defaultTarget = note.swara === 'P' ? 'D' : 'P';
      onUpdateNote({
        ...note,
        ornament: {
          type,
          targetSwara: note.ornament?.targetSwara || defaultTarget,
        },
        manuallyEdited: true,
      });
    }
  };

  const handleTargetSwaraChange = (targetSwara: string) => {
    if (!note.ornament) return;
    onUpdateNote({
      ...note,
      ornament: {
        ...note.ornament,
        targetSwara,
      },
      manuallyEdited: true,
    });
  };

  return (
    <div className="border border-border/80 bg-slate-900/95 rounded-xl p-3.5 shadow-xl text-xs space-y-3 backdrop-blur-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm text-foreground">
            Edit Note: <span className="text-primary font-mono">{note.swara}</span>
            {note.octave > 0 ? "'" : note.octave < 0 ? ',' : ''}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {note.startTime.toFixed(2)}s – {note.endTime.toFixed(2)}s ({Math.round(note.durationSeconds * 1000)}ms)
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {note.medianFrequencyHz.toFixed(1)} Hz
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAuditionSlice(note.startTime, note.endTime)}
            className="h-7 text-xs gap-1"
            title="Audition audio recording slice"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Audio
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAuditionSynth(note)}
            className="h-7 text-xs gap-1 text-primary"
            title="Audition synth playback"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Synth
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 w-7 p-0 ml-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Swara Palette & Octave Row */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Swara (Pitch Class)</span>
          <div className="flex items-center gap-1 font-mono">
            <span className="text-xs">Octave:</span>
            {[-1, 0, 1].map((oct) => (
              <button
                key={oct}
                type="button"
                onClick={() => handleOctaveChange(oct)}
                className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-all ${
                  note.octave === oct
                    ? 'bg-primary text-primary-foreground font-bold'
                    : 'bg-muted hover:bg-muted/80 text-foreground'
                }`}
              >
                {oct === -1 ? 'Mandra (,)' : oct === 1 ? "Taar (')" : 'Maddhya'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
          {ALL_SWARAS.map((s) => {
            const isSelected = note.swara === s.swara;
            const isAllowed = !allowedSet || allowedSet.has(s.swara);
            return (
              <button
                key={s.swara}
                type="button"
                onClick={() => handleSwaraChange(s.swara)}
                className={`py-1.5 rounded-md font-mono text-center cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs scale-105'
                    : isAllowed
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500 opacity-60'
                }`}
                title={`${s.label}${!isAllowed ? ' (Varjit in this raga)' : ''}`}
              >
                <div className="text-xs font-bold leading-none">{s.swara}</div>
                <div className="text-[9px] opacity-75 leading-none mt-0.5">
                  {s.swara === 'S' || s.swara === 'P' ? '●' : s.isKomal ? 'k' : s.isTivra ? 't' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ornament Controls & Note Operations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/50">
        {/* Ornaments */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Ornament</label>
          <div className="flex items-center gap-1.5">
            <Select
              value={note.ornament?.type || 'none'}
              onValueChange={(val: any) => handleOrnamentTypeChange(val)}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="No Ornament" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  None (Straight note)
                </SelectItem>
                <SelectItem value="meend" className="text-xs">
                  Meend (Continuous Glide ↗)
                </SelectItem>
                <SelectItem value="kan" className="text-xs">
                  Kan (Grace Note)
                </SelectItem>
              </SelectContent>
            </Select>

            {note.ornament && (
              <div className="flex items-center gap-1">
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                <Select
                  value={note.ornament.targetSwara || 'P'}
                  onValueChange={handleTargetSwaraChange}
                >
                  <SelectTrigger className="h-8 w-20 text-xs font-mono">
                    <SelectValue placeholder="Target" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_SWARAS.map((s) => (
                      <SelectItem key={s.swara} value={s.swara} className="text-xs font-mono">
                        {s.swara}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Note Split & Delete Actions */}
        <div className="flex items-end justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSplitNote(note.id)}
            className="h-8 text-xs gap-1 border-border/80"
            title="Split note in half"
          >
            <Split className="w-3.5 h-3.5" />
            Split Note
          </Button>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDeleteNote(note.id)}
            className="h-8 text-xs gap-1"
            title="Delete this note"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};
