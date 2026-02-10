import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as Tone from "tone";
import type { MusicCell as ParsedMusicCell } from "../utils/sargam_parser";
import { VisualizerHeader } from "./visualizer/VisualizerHeader";
import { VisualizerBeatNumbers } from "./visualizer/VisualizerGrid";
import { VisualizerLine } from "./visualizer/VisualizerLine";

interface MusicVisualizerProps {
  parsedData: ParsedMusicCell | null;
  isPlaying: boolean;
  onPlay: () => void;
  initialTime?: number;
  onSeek?: (time: number) => void;
}

interface LineData {
  events: Array<{
    startTime: number;
    durationSeconds: number;
    [key: string]: any;
  }>;
  duration: number;
  startTime: number;
}

interface VoiceData {
  lines: LineData[];
  totalDuration: number;
  beatDur: number;
  beatCount: number;
}

export function MusicVisualizer({ parsedData, isPlaying, onPlay, initialTime = 0, onSeek }: MusicVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  // We keep a ref for the current time to avoid closure staleness in the loop without re-renders
  const currentTimeRef = useRef(initialTime);
  const requestRef = useRef<number>(null);

  // Group events by line_index for the first voice (primary visual)
  const voiceData = useMemo<VoiceData | null>(() => {
    if (!parsedData || !parsedData.voices) return null;
    const mainVoice = Object.values(parsedData.voices)[0];
    if (!mainVoice) return null;

    const lines: Record<number, LineData> = {};
    let absTime = 0;
    const bpm = parsedData.directives.tempo
      ? parseFloat(parsedData.directives.tempo)
      : 120;
    const beatDur = 60 / bpm;

    mainVoice.events.forEach((event) => {
      // Include duration-based events, comments, and bars
      const e = event as any;
      if (e.duration === undefined && e.type !== 'comment' && e.type !== 'bar') return;

      const lineIdx = event.line_index || 0;
      if (!lines[lineIdx])
        lines[lineIdx] = { events: [], duration: 0, startTime: absTime };

      const durationSeconds = (e.type === 'comment' || e.type === 'bar') ? 0 : (e.duration || 0) * beatDur;

      lines[lineIdx].events.push({
        ...event,
        startTime: absTime,
        durationSeconds,
      });
      lines[lineIdx].duration += durationSeconds;

      if (event.type !== 'comment') {
        absTime += durationSeconds;
      }
    });

    // Parse beat count from tala if available (e.g., "Tintal(16)")
    let beatCount = 0;
    const tala = parsedData.directives.tala;
    if (tala) {
      const match = tala.match(/\((\d+)\)/);
      if (match) beatCount = parseInt(match[1], 10);
    }

    return {
      lines: Object.values(lines),
      totalDuration: absTime,
      beatDur,
      beatCount,
    };
  }, [parsedData]);

  // Explicit state for active line index to trigger re-renders only when line changes
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const activeLineIndexRef = useRef(activeLineIndex);

  // Update ref when state changes
  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex]);


  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%

  // BEAT_WIDTH calculation needed for pixelsPerSecond
  // Dynamic BEAT_WIDTH calculation:
  const PADDING = 48;
  const rawBeatWidth =
    (voiceData?.beatCount ?? 0) > 0
      ? Math.abs((containerWidth - PADDING) / (voiceData?.beatCount ?? 1))
      : 60;

  // Calculate base width (fit to screen logic), then apply zoom
  const baseBeatWidth = Math.max(46, Math.min(120, rawBeatWidth));
  const BEAT_WIDTH = baseBeatWidth * zoomLevel;

  const bpm = parsedData?.directives.tempo
    ? parseFloat(parsedData.directives.tempo)
    : 120;
  const PIXELS_PER_SECOND = (BEAT_WIDTH * bpm) / 60;

  const updateVisuals = useCallback((overrideTime?: number) => {
    if (!voiceData) return;

    const now = typeof overrideTime === 'number' ? overrideTime : Tone.getTransport().seconds;
    currentTimeRef.current = now;

    // 1. Calculate active line
    // Optimization: Start searching from current or next line instead of finding from scratch
    // But findIndex is fast enough for < 1000 lines usually.
    let newActiveLineIdx = -1;
    // Fast path: check current line first
    const currentIdx = activeLineIndexRef.current;
    if (currentIdx !== -1 && voiceData.lines[currentIdx]) {
      const line = voiceData.lines[currentIdx];
      if (now >= line.startTime && now <= line.startTime + line.duration) {
        newActiveLineIdx = currentIdx;
      }
    }

    if (newActiveLineIdx === -1) {
      newActiveLineIdx = voiceData.lines.findIndex(
        (line) =>
          now >= line.startTime &&
          now <= line.startTime + line.duration
      );
    }

    // Only update state if line changed
    if (newActiveLineIdx !== activeLineIndexRef.current) {
      setActiveLineIndex(newActiveLineIdx);
      // Reset scroll when line changes
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
      return;
    }

    // 2. Update Playhead Position directly
    if (playheadRef.current && newActiveLineIdx !== -1) {
      const line = voiceData.lines[newActiveLineIdx];
      const lineProgress = now - line.startTime;
      // Use transform for smooth GPU animation
      playheadRef.current.style.transform = `translateX(${lineProgress * PIXELS_PER_SECOND}px)`;

      // 3. Handle Auto-scroll inside the loop
      if (scrollContainerRef.current) {
        const scrollContainer = scrollContainerRef.current;
        const playhead = playheadRef.current;
        const lineContainer = playhead.closest('[style*="height"]'); // VisualizerLine container

        if (lineContainer) {
          const playheadRect = playhead.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          // Simple check: is playhead near right edge?
          const relativeX = playheadRect.left - containerRect.left;

          // If playhead > 95% of view width
          if (relativeX > containerRect.width * 0.95) {
            // Scroll forward
            // Calculate target: current scroll + relativeX - 10% buffering
            const currentScroll = scrollContainer.scrollLeft;
            const targetScroll = currentScroll + relativeX - (containerRect.width * 0.1);
            scrollContainer.scrollLeft = targetScroll;
          }
        }
      }
    }
  }, [voiceData, PIXELS_PER_SECOND]);

  // Initialize active line on load/seek
  useEffect(() => {
    if (!voiceData) return;
    const idx = voiceData.lines.findIndex(
      (line) =>
        initialTime >= line.startTime &&
        initialTime <= line.startTime + line.duration
    );
    setActiveLineIndex(idx);
    currentTimeRef.current = initialTime;

    // Force direct visual update if paused, so seek updates immediately
    if (!isPlaying) {
      updateVisuals(initialTime);
    }
  }, [initialTime, voiceData, isPlaying, updateVisuals]);

  // Animation Loop
  useEffect(() => {
    const loop = () => {
      if (isPlaying) {
        updateVisuals();
        requestRef.current = requestAnimationFrame(loop);
      }
    };

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(loop);
      // Focus view on start
      if (containerRef.current) {
        containerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, updateVisuals]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!voiceData) return null;

  return (
    <div
      ref={containerRef}
      className="mt-4 md:mt-6 p-4 md:p-6 bg-card/60 backdrop-blur-xl border border-border/40 rounded-xl md:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-full relative group/viz"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <VisualizerHeader
            parsedData={parsedData}
            isPlaying={isPlaying}
            onPlay={onPlay}
            bpm={bpm}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
          />

        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto custom-scrollbar py-5 max-w-full"
      >
        <div className="min-w-max flex flex-col">
          <VisualizerBeatNumbers
            beatCount={voiceData?.beatCount ?? 16}
            beatWidth={BEAT_WIDTH}
            zoomLevel={zoomLevel}
          />

          <div className="pt-6">
            {voiceData?.lines?.map((line, idx) => {
              const isActive = idx === activeLineIndex;

              return (
                <VisualizerLine
                  key={idx + (line.events[0]?.startTime || 0)}
                  previousLine={idx !== 0 ? voiceData.lines.at(idx - 1) : null}
                  line={line}
                  isActive={isActive}
                  // We pass a rough currentTime prop if needed, but for the running line
                  // the Playhead is handled via Ref. 
                  // If we don't pass reliable currentTime, the static background lines might be ok.
                  // But 'isActive' is what triggers the playhead mount.
                  currentTime={isActive ? currentTimeRef.current : 0}
                  beatDur={voiceData.beatDur}
                  beatCount={voiceData.beatCount}
                  beatWidth={BEAT_WIDTH}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  onSeek={onSeek}
                  playheadRef={isActive ? playheadRef : undefined}
                  zoomLevel={zoomLevel}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
