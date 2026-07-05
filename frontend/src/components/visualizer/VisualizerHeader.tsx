import React, { useState } from 'react';
import { Play, Minus, Plus, Square, Search, Activity, Repeat } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { MusicCell as ParsedMusicCell } from '../../utils/sargam_parser';
import { NoteLegendModal } from './NoteLegendModal';

interface VisualizerHeaderProps {
  parsedData: ParsedMusicCell | null;
  isPlaying: boolean;
  onPlay: () => void;
  bpm: number;
  setBpm: React.Dispatch<React.SetStateAction<number | null>>;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  isLooping: boolean;
  onToggleLoop: () => void;
}

export function VisualizerHeader({
  parsedData,
  isPlaying,
  onPlay,
  bpm,
  setBpm,
  zoomLevel,
  setZoomLevel,
  isLooping,
  onToggleLoop,
}: VisualizerHeaderProps) {
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const scoreTitle = parsedData?.directives.title?.trim() || 'Score';

  return (
    <div className="flex items-start justify-between w-full gap-4 overflow-x-auto custom-scrollbar pb-1">
      <div className="space-y-1 shrink-0">
        <div className="flex items-center gap-1">
          <h3 className="text-xss font-bold text-primary/80">{scoreTitle}</h3>
          <NoteLegendModal />
        </div>
        <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
          {parsedData?.directives.tala || 'Free Rhythm'}
        </p>
      </div>

      <div className="flex flex-col items-end md:items-end gap-2 md:gap-3 shrink-0">
        {/* Mobile Controls - Popovers */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {/* BPM Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                disabled={isPlaying}
                variant="outline"
                size="sm"
                className="h-9 px-2 rounded-full border-border/50 bg-muted/30"
              >
                <span className="text-xs font-mono">{bpm} bpm</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="end">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Tempo
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 font-medium">
                    BPM
                  </span>
                </div>
                <div className="flex items-center justify-between bg-muted/30 p-1 rounded-lg border border-border/50">
                  <Button
                    disabled={isPlaying}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setBpm((b) => {
                        if (b) return Math.max(10, b - 5);
                        return null;
                      });
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div
                    className="relative flex items-center cursor-pointer min-w-12 justify-center"
                    onClick={() => setIsEditingBpm(true)}
                  >
                    {isEditingBpm ? (
                      <Input
                        type="number"
                        value={bpm}
                        autoFocus
                        onBlur={() => setIsEditingBpm(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setIsEditingBpm(false);
                          }
                        }}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val > 0) setBpm(val);
                        }}
                        className="h-8 w-14 text-center text-xs p-0 border-none bg-transparent focus-visible:ring-0"
                      />
                    ) : (
                      <span className="text-xs font-mono w-14 text-center">{bpm}</span>
                    )}
                  </div>
                  <Button
                    disabled={isPlaying}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setBpm((b) => {
                        if (b) return Math.min(300, b + 5);
                        return null;
                      });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Zoom Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                disabled={isPlaying}
                variant="outline"
                size="sm"
                className="h-9 px-2 rounded-full border-border/50 bg-muted/30"
              >
                <Search className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span className="text-xs font-mono">
                  {Math.round(zoomLevel * 100)}%
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="end">
              <div className="flex flex-col gap-2">
                <div className="flex items-center px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Zoom
                  </span>
                </div>
                <div className="flex items-center justify-between bg-muted/30 p-1 rounded-lg border border-border/50">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                    disabled={zoomLevel <= 0.5 || isPlaying}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-mono w-14 text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                    disabled={zoomLevel >= 3 || isPlaying}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-row gap-2 justify-center items-end">
          {/* Loop Toggle Button */}
          <Button
            onClick={onToggleLoop}
            variant={isLooping ? 'default' : 'outline'}
            size="sm"
            className={`rounded-full shrink-0 ${isLooping ? '' : 'border-border/50 bg-muted/30 text-muted-foreground'}`}
            title={isLooping ? 'Looping enabled' : 'Looping disabled'}
          >
            <Repeat className="w-4 h-4" />
          </Button>

          {/* Play/Stop Button */}
          <Button
            onClick={onPlay}
            variant={'default'}
            size="sm"
            className="rounded-full shrink-0 md:w-auto"
          >
            {isPlaying ? (
              <>
                <Square className="w-3 h-3 fill-current shrink-0 mr-2" />
                <span className="inline">Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current shrink-0 mr-2" />
                <span className="inline">Play</span>
              </>
            )}
          </Button>
        </div>

        {/* Desktop Controls - Hidden on Mobile */}
        <div className="hidden md:flex gap-5 bg-muted/30 p-2 rounded-xl border border-border/50 shrink-0">
          {/* Tempo Control */}
          <div className="flex flex-col gap-1.5 border-r border-border/40 pr-5">
            <div className="flex items-center gap-1.5 px-1">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Tempo
              </span>
            </div>
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isPlaying}
                onClick={() => {
                  setBpm((b) => {
                    if (b) return Math.max(10, b - 5);
                    return null;
                  });
                }}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <div
                className="relative flex items-center cursor-pointer min-w-14 justify-center"
                onClick={() => setIsEditingBpm(true)}
              >
                {isEditingBpm ? (
                  <Input
                    type="number"
                    value={bpm}
                    autoFocus
                    onBlur={() => setIsEditingBpm(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setIsEditingBpm(false);
                      }
                    }}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val > 0) setBpm(val);
                    }}
                    className="h-7 w-12 text-center text-xs p-0 border-none bg-transparent focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                ) : (
                  <span className="text-xs font-mono w-12 text-center">{bpm}</span>
                )}
                <span className="text-[9px] text-muted-foreground/60 font-medium pr-1">
                  BPM
                </span>
              </div>
              <Button
                disabled={isPlaying}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setBpm((b) => {
                    if (b) return Math.min(300, b + 5);
                    return null;
                  });
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Zoom Control */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Search className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Zoom
              </span>
            </div>
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                disabled={zoomLevel <= 0.5 || isPlaying}
                title="Zoom Out"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-mono w-14 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                disabled={zoomLevel >= 3 || isPlaying}
                title="Zoom In"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
