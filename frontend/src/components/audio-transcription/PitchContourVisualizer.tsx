import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { ContinuousPitchContour, TranscribedNoteEvent } from '@/utils/audio/types';
import { ZoomIn, ZoomOut, RotateCcw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PitchContourVisualizerProps {
  contour: ContinuousPitchContour;
  notes: TranscribedNoteEvent[];
  saPitch: string;
  saFrequency: number;
  currentTime?: number;
  isPlaying?: boolean;
  selectedNoteId?: string | null;
  onSelectNote?: (note: TranscribedNoteEvent | null) => void;
  onNotesChange?: (updatedNotes: TranscribedNoteEvent[]) => void;
  onSeek?: (timeSec: number) => void;
  onAuditionSlice?: (startSec: number, endSec: number) => void;
  className?: string;
}

const SWARA_CENTS_MAP: { cents: number; swara: string; isPillar: boolean }[] = [
  { cents: 1200, swara: "S'", isPillar: true },
  { cents: 1100, swara: "N'", isPillar: false },
  { cents: 900, swara: "D'", isPillar: false },
  { cents: 700, swara: "P'", isPillar: true },
  { cents: 500, swara: "m'", isPillar: false },
  { cents: 400, swara: "G'", isPillar: false },
  { cents: 200, swara: "R'", isPillar: false },
  { cents: 0, swara: 'S', isPillar: true },
  { cents: -100, swara: 'N,', isPillar: false },
  { cents: -200, swara: 'n,', isPillar: false },
  { cents: -300, swara: 'D,', isPillar: false },
  { cents: -400, swara: 'd,', isPillar: false },
  { cents: -500, swara: 'P,', isPillar: true },
  { cents: -600, swara: 'Mt,', isPillar: false },
  { cents: -700, swara: 'm,', isPillar: false },
  { cents: -800, swara: 'G,', isPillar: false },
  { cents: -1000, swara: 'R,', isPillar: false },
  { cents: -1200, swara: 'S,', isPillar: true },
];

export const PitchContourVisualizer: React.FC<PitchContourVisualizerProps> = ({
  contour,
  notes,
  saPitch,
  saFrequency,
  currentTime = 0,
  isPlaying = false,
  selectedNoteId = null,
  onSelectNote,
  onNotesChange,
  onSeek,
  onAuditionSlice,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 1.0 = fit, up to 4x
  const [scrollOffsetSec, setScrollOffsetSec] = useState<number>(0);
  const [hoveredNote, setHoveredNote] = useState<TranscribedNoteEvent | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Drag state for adjusting note boundaries
  const [dragState, setDragState] = useState<{
    noteId: string;
    edge: 'start' | 'end';
    origStartTime: number;
    origEndTime: number;
  } | null>(null);

  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');

  // Time boundaries
  const totalDuration = useMemo(() => {
    if (contour.length === 0) return 1.0;
    return Math.max(1.0, contour[contour.length - 1].time);
  }, [contour]);

  // Cents range
  const minCents = -1400; // slightly below mandra S,
  const maxCents = 1400; // slightly above taar S'
  const centsRange = maxCents - minCents;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(4.0, z * 1.3));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(1.0, z / 1.3));
  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setScrollOffsetSec(0);
  };

  // Follow playhead if playing and zoomed in
  useEffect(() => {
    if (isPlaying && zoomLevel > 1.0) {
      const visibleDuration = totalDuration / zoomLevel;
      if (currentTime > scrollOffsetSec + visibleDuration * 0.8) {
        setScrollOffsetSec(
          Math.min(totalDuration - visibleDuration, currentTime - visibleDuration * 0.2)
        );
      } else if (currentTime < scrollOffsetSec) {
        setScrollOffsetSec(Math.max(0, currentTime - visibleDuration * 0.1));
      }
    }
  }, [currentTime, isPlaying, zoomLevel, totalDuration, scrollOffsetSec]);

  // Draw Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    const leftMargin = 50;
    const graphWidth = width - leftMargin;
    const visibleDuration = totalDuration / zoomLevel;
    const startSec = scrollOffsetSec;
    const endSec = startSec + visibleDuration;

    const timeToX = (t: number) => {
      return leftMargin + ((t - startSec) / visibleDuration) * graphWidth;
    };

    const centsToY = (c: number) => {
      const clamped = Math.max(minCents, Math.min(maxCents, c));
      const norm = (maxCents - clamped) / centsRange;
      return norm * (height - 30) + 10;
    };

    // 1. Draw horizontal swara pitch lane lines
    ctx.lineWidth = 1;
    for (const item of SWARA_CENTS_MAP) {
      const y = centsToY(item.cents);
      ctx.beginPath();
      if (item.cents === 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)'; // Sa = prominent red/coral
        ctx.lineWidth = 1.5;
      } else if (item.isPillar) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)'; // Pa / Sa' = amber
        ctx.lineWidth = 1.2;
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)'; // other swaras = faint slate
        ctx.lineWidth = 1;
      }
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Label on left margin
      ctx.fillStyle =
        item.cents === 0
          ? '#ef4444'
          : item.isPillar
          ? '#f59e0b'
          : '#94a3b8';
      ctx.font =
        item.cents === 0
          ? 'bold 11px system-ui, sans-serif'
          : '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.swara, leftMargin - 8, y);
    }

    // 2. Draw Waveform energy backdrop
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)'; // faint sky-blue
    for (const pt of contour) {
      if (pt.time < startSec || pt.time > endSec) continue;
      const x = timeToX(pt.time);
      const barH = Math.min(height * 0.4, pt.rms * height * 2.5);
      const centerY = height / 2;
      ctx.fillRect(x - 1, centerY - barH / 2, 2, barH);
    }

    // 3. Draw Segmented Note Blocks (Sargam note events)
    for (const note of notes) {
      if (note.endTime < startSec || note.startTime > endSec) continue;
      const x1 = Math.max(leftMargin, timeToX(note.startTime));
      const x2 = Math.min(width, timeToX(note.endTime));
      const y = centsToY(note.centsFromSa);
      const noteW = Math.max(4, x2 - x1);
      const noteH = 20;

      const isSelected = selectedNoteId === note.id;
      const isMeend = !!note.ornament && note.ornament.type === 'meend';

      if (isSelected) {
        // Selection glowing outline
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(x1 - 1, y - noteH / 2 - 1, noteW + 2, noteH + 2, 5);
        ctx.stroke();
        ctx.restore();
      }

      // Note pill background
      ctx.fillStyle = isSelected
        ? 'rgba(56, 189, 248, 0.45)'
        : isMeend
        ? 'rgba(168, 85, 247, 0.28)'
        : 'rgba(59, 130, 246, 0.25)';
      ctx.strokeStyle = isSelected
        ? '#38bdf8'
        : isMeend
        ? '#c084fc'
        : '#60a5fa';
      ctx.lineWidth = isSelected ? 2.0 : 1.2;

      ctx.beginPath();
      ctx.roundRect(x1, y - noteH / 2, noteW, noteH, 4);
      ctx.fill();
      ctx.stroke();

      // Drag handles on left and right edge if selected or hovered
      if (isSelected || hoveredNote?.id === note.id) {
        ctx.fillStyle = '#ffffff';
        // Left resize handle
        ctx.fillRect(x1 + 1, y - noteH / 2 + 4, 2, noteH - 8);
        // Right resize handle
        ctx.fillRect(x2 - 3, y - noteH / 2 + 4, 2, noteH - 8);
      }

      // Swara Text label inside pill if space permits
      if (noteW > 14) {
        ctx.fillStyle = '#ffffff';
        ctx.font = isSelected ? 'bold 11px system-ui, sans-serif' : 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = isMeend
          ? `${note.swara} ↗ ${note.ornament?.targetSwara || ''}`
          : note.swara;
        ctx.fillText(label, x1 + noteW / 2, y);
      }
    }

    // 4. Draw Continuous Pitch Contour Polyline
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let inPath = false;
    ctx.beginPath();

    for (let i = 0; i < contour.length; i++) {
      const pt = contour[i];
      if (pt.time < startSec || pt.time > endSec) continue;

      if (!pt.isVoiced || pt.frequency <= 0) {
        if (inPath) {
          ctx.stroke();
          ctx.beginPath();
          inPath = false;
        }
        continue;
      }

      const x = timeToX(pt.time);
      const y = centsToY(pt.centsFromSa);

      if (!inPath) {
        ctx.beginPath();
        // High clarity = bright green/emerald, lower = cyan
        ctx.strokeStyle =
          pt.clarity > 0.65 ? '#10b981' : '#06b6d4';
        ctx.moveTo(x, y);
        inPath = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (inPath) {
      ctx.stroke();
    }

    // 5. Draw Playback Scrubber line
    if (currentTime >= startSec && currentTime <= endSec) {
      const playX = timeToX(currentTime);
      ctx.beginPath();
      ctx.strokeStyle = '#f43f5e'; // rose-500
      ctx.lineWidth = 2;
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();

      // Playhead head icon
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(playX, 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [
    contour,
    notes,
    selectedNoteId,
    hoveredNote,
    zoomLevel,
    scrollOffsetSec,
    totalDuration,
    currentTime,
    minCents,
    maxCents,
    centsRange,
  ]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderCanvas();
      if (isPlaying) {
        animId = requestAnimationFrame(loop);
      }
    };
    loop();
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [renderCanvas, isPlaying]);

  // Mouse interaction: select, drag boundary, seek
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const leftMargin = 50;
    const graphWidth = rect.width - leftMargin;

    if (mouseX < leftMargin) return;

    const visibleDuration = totalDuration / zoomLevel;
    const clickTime = scrollOffsetSec + ((mouseX - leftMargin) / graphWidth) * visibleDuration;

    // Check if clicked near edge of any note
    for (const note of notes) {
      const x1 = leftMargin + ((note.startTime - scrollOffsetSec) / visibleDuration) * graphWidth;
      const x2 = leftMargin + ((note.endTime - scrollOffsetSec) / visibleDuration) * graphWidth;
      const clamped = Math.max(minCents, Math.min(maxCents, note.centsFromSa));
      const norm = (maxCents - clamped) / centsRange;
      const y = norm * (rect.height - 30) + 10;

      if (Math.abs(mouseY - y) <= 16) {
        // Check left edge (±7px)
        if (Math.abs(mouseX - x1) <= 7) {
          setDragState({
            noteId: note.id,
            edge: 'start',
            origStartTime: note.startTime,
            origEndTime: note.endTime,
          });
          onSelectNote?.(note);
          return;
        }
        // Check right edge (±7px)
        if (Math.abs(mouseX - x2) <= 7) {
          setDragState({
            noteId: note.id,
            edge: 'end',
            origStartTime: note.startTime,
            origEndTime: note.endTime,
          });
          onSelectNote?.(note);
          return;
        }
        // Check inside note body
        if (mouseX >= x1 && mouseX <= x2) {
          onSelectNote?.(note);
          return;
        }
      }
    }

    // Clicked empty background
    onSelectNote?.(null);
    onSeek?.(Math.max(0, Math.min(totalDuration, clickTime)));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const leftMargin = 50;
    const graphWidth = rect.width - leftMargin;
    const visibleDuration = totalDuration / zoomLevel;

    if (dragState) {
      // Actively dragging an edge!
      const currTime = scrollOffsetSec + ((mouseX - leftMargin) / graphWidth) * visibleDuration;
      const targetNote = notes.find((n) => n.id === dragState.noteId);
      if (targetNote && onNotesChange) {
        const updated = notes.map((n) => {
          if (n.id !== dragState.noteId) return n;
          if (dragState.edge === 'start') {
            const newStart = Math.min(n.endTime - 0.05, Math.max(0, currTime));
            return {
              ...n,
              startTime: Number(newStart.toFixed(3)),
              durationSeconds: Number((n.endTime - newStart).toFixed(3)),
              manuallyEdited: true,
            };
          } else {
            const newEnd = Math.max(n.startTime + 0.05, Math.min(totalDuration, currTime));
            return {
              ...n,
              endTime: Number(newEnd.toFixed(3)),
              durationSeconds: Number((newEnd - n.startTime).toFixed(3)),
              manuallyEdited: true,
            };
          }
        });
        onNotesChange(updated);
      }
      return;
    }

    // Hover detection & cursor styling
    if (mouseX >= leftMargin) {
      let isNearEdge = false;
      let matchedNote: TranscribedNoteEvent | null = null;

      for (const note of notes) {
        const x1 = leftMargin + ((note.startTime - scrollOffsetSec) / visibleDuration) * graphWidth;
        const x2 = leftMargin + ((note.endTime - scrollOffsetSec) / visibleDuration) * graphWidth;
        const clamped = Math.max(minCents, Math.min(maxCents, note.centsFromSa));
        const norm = (maxCents - clamped) / centsRange;
        const y = norm * (rect.height - 30) + 10;

        if (Math.abs(mouseY - y) <= 16) {
          if (Math.abs(mouseX - x1) <= 7 || Math.abs(mouseX - x2) <= 7) {
            isNearEdge = true;
            matchedNote = note;
            break;
          }
          if (mouseX >= x1 && mouseX <= x2) {
            matchedNote = note;
            break;
          }
        }
      }

      if (isNearEdge) {
        setCursorStyle('col-resize');
      } else if (matchedNote) {
        setCursorStyle('pointer');
      } else {
        setCursorStyle('crosshair');
      }

      if (matchedNote) {
        setHoveredNote(matchedNote);
        setHoverPos({ x: e.clientX, y: e.clientY });
      } else {
        setHoveredNote(null);
        setHoverPos(null);
      }
    }
  };

  const handleMouseUp = () => {
    if (dragState) {
      setDragState(null);
    }
  };

  const handleDoubleClick = () => {
    if (hoveredNote && onAuditionSlice) {
      onAuditionSlice(hoveredNote.startTime, hoveredNote.endTime);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col rounded-xl border border-border bg-slate-950 overflow-hidden select-none ${className}`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-slate-900/80 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px] gap-1 border-emerald-500/40 text-emerald-400">
            <Activity className="w-3 h-3 text-emerald-400" />
            Continuous Pitch Contour
          </Badge>
          <span className="text-muted-foreground">Sa = <strong className="text-foreground">{saPitch}</strong> ({saFrequency.toFixed(1)} Hz)</span>
          <span className="text-muted-foreground">• {notes.length} note events detected</span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1.0}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground w-8 text-center">
            {zoomLevel.toFixed(1)}x
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 4.0}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          {zoomLevel > 1.0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 ml-1 text-xs"
              onClick={handleResetZoom}
              title="Reset Zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Canvas */}
      <div className="relative w-full h-56 sm:h-64">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onMouseLeave={() => {
            setHoveredNote(null);
            if (dragState) setDragState(null);
          }}
          style={{ cursor: cursorStyle }}
          className="w-full h-full block"
        />

        {/* Legend Overlay at bottom right */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-md px-2 py-1 text-[10px] text-slate-300 pointer-events-none">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-emerald-400 rounded-full inline-block" /> Pitch Curve
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2 bg-blue-500/40 border border-blue-400 rounded-xs inline-block" /> Swara Note
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2 bg-purple-500/40 border border-purple-400 rounded-xs inline-block" /> Meend
          </span>
        </div>
      </div>

      {/* Floating Note Tooltip */}
      {hoveredNote && hoverPos && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900/95 text-white border border-slate-700 rounded-md p-2 text-xs shadow-xl backdrop-blur-xs flex flex-col gap-0.5"
          style={{
            left: Math.min(window.innerWidth - 180, hoverPos.x + 12),
            top: Math.max(10, hoverPos.y - 70),
          }}
        >
          <div className="font-bold flex items-center gap-1.5">
            <span className="text-sm text-blue-400">{hoveredNote.swara}</span>
            <span className="text-[10px] text-muted-foreground">({hoveredNote.medianFrequencyHz.toFixed(1)} Hz)</span>
            {hoveredNote.ornament && (
              <Badge variant="outline" className="text-[9px] py-0 px-1 border-purple-500 text-purple-300">
                {hoveredNote.ornament.type}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-slate-300">
            {hoveredNote.startTime.toFixed(2)}s – {hoveredNote.endTime.toFixed(2)}s ({Math.round(hoveredNote.durationSeconds * 1000)}ms)
          </div>
          <div className="text-[10px] text-emerald-400">
            Confidence: {Math.round(hoveredNote.confidence * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};
