import { useEffect, useRef, useState, useMemo } from "react";
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
  const [currentTime, setCurrentTime] = useState(initialTime);
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
      // We attribute 0 or small duration to comment? 
      // Actually comments shouldn't advance music time usually if they are blocks associated with a line. 
      // But here we're grouping strictly by line_index from parser.
      // Parser increments line index for new lines.
      // So a comment line is its own line_index.

      lines[lineIdx].events.push({
        ...event,
        startTime: absTime,
        durationSeconds,
      });
      lines[lineIdx].duration += durationSeconds;

      // If it's a music event, it advances time. If comment, it might not?
      // For now, let's treat comments as having 0 duration in playback time, 
      // but they exist in the sequence.
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

  const animate = () => {
    if (isPlaying) {
      setCurrentTime(Tone.getTransport().seconds);
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  const [containerWidth, setContainerWidth] = useState(0);

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

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
      // Focus and scroll into view when visualizer appears
      if (containerRef.current) {
        containerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      setCurrentTime(initialTime);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, initialTime]);

  // Find current active line based on currentTime
  const activeLineIndex = useMemo(() => {
    if (!voiceData || !voiceData.lines) return -1;
    return voiceData.lines.findIndex(
      (line) =>
        currentTime >= line.startTime &&
        currentTime <= line.startTime + line.duration
    );
  }, [voiceData, currentTime]);

  // Track previous active line index to detect line changes
  const prevActiveLineIndexRef = useRef(-1);

  // Reset scroll when moving to a new line
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current || activeLineIndex === -1)
      return;

    // If we've moved to a new line, reset scroll to beginning
    if (
      prevActiveLineIndexRef.current !== -1 &&
      prevActiveLineIndexRef.current !== activeLineIndex
    ) {
      scrollContainerRef.current.scrollLeft = 0;
    }

    // Update previous index
    prevActiveLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex, isPlaying]);

  // Check if current line has ended
  useEffect(() => {
    if (
      !isPlaying ||
      !scrollContainerRef.current ||
      !voiceData ||
      activeLineIndex === -1
    )
      return;

    const activeLine = voiceData.lines[activeLineIndex];
    if (!activeLine) return;

    // Check if we've reached the end of the current line
    const lineEndTime = activeLine.startTime + activeLine.duration;
    const isAtLineEnd = currentTime >= lineEndTime - 0.1; // Small threshold to account for timing

    if (isAtLineEnd) {
      // Reset scroll to beginning
      scrollContainerRef.current.scrollLeft = 0;
    }
  }, [currentTime, isPlaying, activeLineIndex, voiceData]);


  // Auto-scroll to keep playhead in view - jump scroll when about to overflow
  useEffect(() => {
    if (
      !isPlaying ||
      !scrollContainerRef.current ||
      !playheadRef.current ||
      activeLineIndex === -1
    )
      return;

    const scrollContainer = scrollContainerRef.current;
    const playhead = playheadRef.current;
    if (!scrollContainer || !playhead) return;

    // Get the line container that holds the playhead
    const lineContainer = playhead.closest('[style*="height"]');
    if (!lineContainer) return;

    // Get bounding rectangles
    const playheadRect = playhead.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const lineRect = lineContainer.getBoundingClientRect();

    // Calculate playhead's position within the scrollable content
    const playheadLeftInContent =
      lineRect.left -
      containerRect.left +
      (playheadRect.left - lineRect.left) +
      scrollContainer.scrollLeft;

    // Check if playhead is about to overflow (within 5% of right edge)
    const overflowThreshold = containerRect.width * 0.95;
    const playheadPositionInView = playheadRect.left - containerRect.left;

    // If playhead is about to move out of view (past 95% of container width)
    if (playheadPositionInView > overflowThreshold) {
      // Scroll so playhead is at 10% from left
      const targetPosition = playheadLeftInContent - containerRect.width * 0.1;
      scrollContainer.scrollLeft = Math.max(0, targetPosition);
    }
  }, [currentTime, isPlaying, activeLineIndex]);

  if (!voiceData) return null;

  // Dynamic BEAT_WIDTH calculation:
  const PADDING = 48;
  const rawBeatWidth =
    voiceData.beatCount > 0
      ? (containerWidth - PADDING) / voiceData.beatCount
      : 60;
  const BEAT_WIDTH = Math.max(46, Math.min(80, rawBeatWidth));

  const bpm = parsedData?.directives.tempo
    ? parseFloat(parsedData.directives.tempo)
    : 120;
  const PIXELS_PER_SECOND = (BEAT_WIDTH * bpm) / 60;

  return (
    <div
      ref={containerRef}
      className="mt-4 md:mt-6 p-4 md:p-6 bg-card/60 backdrop-blur-xl border border-border/40 rounded-xl md:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-full"
    >
      <VisualizerHeader
        parsedData={parsedData}
        isPlaying={isPlaying}
        onPlay={onPlay}
        bpm={bpm}
      />

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto custom-scrollbar py-5 max-w-full"
      >
        <div className="min-w-max flex flex-col">
          <VisualizerBeatNumbers
            beatCount={voiceData.beatCount}
            beatWidth={BEAT_WIDTH}
          />

          <div className="pt-6">
            {voiceData.lines.map((line, idx) => {
              const isActive = idx === activeLineIndex;

              return (
                <VisualizerLine
                  key={idx + (line.events[0]?.startTime || 0)}
                  previousLine={idx !== 0 ? voiceData.lines.at(idx - 1) : null}
                  line={line}
                  isActive={isActive}
                  currentTime={currentTime}
                  beatDur={voiceData.beatDur}
                  beatCount={voiceData.beatCount}
                  beatWidth={BEAT_WIDTH}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  onSeek={onSeek}
                  playheadRef={isActive ? playheadRef : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
