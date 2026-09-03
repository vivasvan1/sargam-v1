import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import * as Tone from 'tone';
import type { MusicCell as ParsedMusicCell } from '../utils/sargam_parser';
import { VisualizerHeader } from './visualizer/VisualizerHeader';
import { VisualizerBeatNumbers } from './visualizer/VisualizerGrid';
import { VisualizerLine } from './visualizer/VisualizerLine';
import { useIsMobile } from '@/hooks/use-mobile';

interface MusicVisualizerProps {
  parsedData: ParsedMusicCell | null;
  isPlaying: boolean;
  onPlay: () => void;
  initialTime?: number;
  onSeek?: (time: number) => void;
  bpm: number;
  setBpm: React.Dispatch<React.SetStateAction<number | null>>;
  isLooping: boolean;
  onToggleLoop: () => void;
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

interface DisplayLineData extends LineData {
  originalLineIndex: number;
  segmentIndex: number;
  startBeatNumber: number;
  beatCount: number;
  showBeatNumbers: boolean;
  isCommentLine: boolean;
  audioStartTime: number;
  audioEndTime: number;
}

interface VoiceData {
  lines: LineData[];
  totalDuration: number;
  beatDur: number;
  beatCount: number;
}

function getLineChunks(
  lineBeats: number,
  directives: Record<string, string> | undefined,
  isMobile: boolean
): number[] {
  const explicit =
    directives?.visualize_tala ||
    directives?.viz_tala ||
    directives?.visualize ||
    directives?.wrap;

  if (explicit) {
    const parsed = explicit
      .split(/[+,]/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (parsed.length > 0) return parsed;
  }

  // If no explicit directive, only auto-break on mobile when line beats > 8
  if (!isMobile || lineBeats <= 8) return [lineBeats];

  // Option A: balanced chunking with max 8 beats in a row
  const maxPerRow = 8;
  const k = Math.ceil(lineBeats / maxPerRow);
  const base = Math.floor(lineBeats / k);
  const remainder = lineBeats % k;

  const chunks: number[] = [];
  for (let i = 0; i < k; i++) {
    chunks.push(i < remainder ? base + 1 : base);
  }
  return chunks;
}

export const MusicVisualizer = memo(function MusicVisualizer({
  parsedData,
  isPlaying,
  onPlay,
  initialTime = 0,
  onSeek,
  bpm,
  setBpm,
  isLooping,
  onToggleLoop,
}: MusicVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  // We keep a ref for the current time to avoid closure staleness in the loop without re-renders
  const currentTimeRef = useRef(initialTime);
  const requestRef = useRef<number>(null);
  const lastUserScrollRef = useRef(0);

  // Group events by line_index for the first voice (primary visual)
  const voiceData = useMemo<VoiceData | null>(() => {
    if (!parsedData || !parsedData.voices) return null;
    const mainVoice = Object.values(parsedData.voices)[0];
    if (!mainVoice) return null;

    const lines: Record<number, LineData> = {};
    let currentAudioTime = 0;
    let currentVisualTime = 0;

    const currentBpm = bpm;
    const beatDur = 60 / currentBpm;

    mainVoice.events.forEach((event) => {
      // Include duration-based events, comments, and bars
      const e = event as any;
      if (e.duration === undefined && e.type !== 'comment' && e.type !== 'bar')
        return;

      const lineIdx = event.line_index || 0;
      if (!lines[lineIdx])
        lines[lineIdx] = {
          events: [],
          duration: 0,
          startTime: currentVisualTime, // This is visual start time
        };

      // Calculate durations
      let visualDuration = 0;
      let audioDuration = 0;

      if (e.type === 'comment' || e.type === 'bar') {
        // No duration for these
      } else if (e.type === 'skip') {
        visualDuration = (e.duration || 0) * beatDur;
        audioDuration = 0; // Skip consumes 0 audio time
      } else {
        visualDuration = (e.duration || 0) * beatDur;
        audioDuration = visualDuration;
      }

      lines[lineIdx].events.push({
        ...event,
        startTime: currentVisualTime, // Visual start time for rendering
        durationSeconds: visualDuration, // Visual duration for rendering
        audioStartTime: currentAudioTime, // Track audio start time for sync
        audioDuration: audioDuration,
      });

      lines[lineIdx].duration += visualDuration;

      if (event.type !== 'comment') {
        currentVisualTime += visualDuration;
        currentAudioTime += audioDuration;
      }
    });

    // Parse beat count from tala if available (e.g., "Tintal(16)")
    let beatCount = 0;
    const talaCandidate =
      parsedData.directives.tala ||
      parsedData.directives.taal ||
      parsedData.directives.beats ||
      parsedData.directives.beat;
    if (talaCandidate) {
      const match =
        talaCandidate.match(/\((\d+)\)/) || talaCandidate.match(/^\s*(\d+)\s*$/);
      if (match) beatCount = parseInt(match[1], 10);
    }

    if (beatCount === 0) {
      const lineBeats = Object.values(lines).map((l) =>
        Math.round(l.duration / beatDur)
      );
      if (lineBeats.length > 0) {
        beatCount = Math.max(...lineBeats);
      }
    }

    return {
      lines: Object.values(lines),
      totalDuration: currentAudioTime,
      beatDur,
      beatCount,
    };
  }, [parsedData, bpm]);

  const isMobile = useIsMobile();
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  );
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%

  const displayLines = useMemo<DisplayLineData[]>(() => {
    if (!voiceData) return [];

    const result: DisplayLineData[] = [];
    const beatDur = voiceData.beatDur;
    const talaCycleBeats =
      voiceData.beatCount > 0 ? voiceData.beatCount : 16;
    let cycleBeatOffset = 0;

    voiceData.lines.forEach((line, lineIdx) => {
      const isComment = line.events.some((e) => e.type === 'comment');
      if (isComment) {
        result.push({
          ...line,
          originalLineIndex: lineIdx,
          segmentIndex: 0,
          startBeatNumber: 1,
          beatCount: voiceData.beatCount || 16,
          showBeatNumbers: false,
          isCommentLine: true,
          audioStartTime: 0,
          audioEndTime: 0,
        });
        return;
      }

      const lineBeats = Math.max(1, Math.round(line.duration / beatDur));
      const chunks = getLineChunks(
        lineBeats,
        parsedData?.directives,
        isMobile
      );
      const isLineWrapped = chunks.length > 1;

      let currentBeatOffset = 0;
      const firstPlayable = line.events.find(
        (e) => e.type !== 'comment' && e.type !== 'bar'
      );
      const lineAudioStart =
        firstPlayable?.audioStartTime ?? (line.events[0]?.audioStartTime || 0);

      chunks.forEach((chunkBeats, segIdx) => {
        const segStartBeat = currentBeatOffset;
        const segEndBeat = currentBeatOffset + chunkBeats;
        currentBeatOffset = segEndBeat;

        const segStartVisual = line.startTime + segStartBeat * beatDur;
        const segEndVisual = line.startTime + segEndBeat * beatDur;
        const segDuration = chunkBeats * beatDur;

        const segEvents: any[] = [];
        const EPS = 0.0001;

        line.events.forEach((event) => {
          if (event.type === 'comment') return;

          if (event.type === 'bar') {
            if (
              event.startTime >= segStartVisual - EPS &&
              event.startTime <= segEndVisual + EPS
            ) {
              segEvents.push({
                ...event,
                startTime: Math.max(
                  segStartVisual,
                  Math.min(segEndVisual, event.startTime)
                ),
              });
            }
            return;
          }

          const eStart = event.startTime;
          const eEnd = event.startTime + (event.durationSeconds || 0);

          if (eEnd > segStartVisual + EPS && eStart < segEndVisual - EPS) {
            const overlapStart = Math.max(eStart, segStartVisual);
            const overlapEnd = Math.min(eEnd, segEndVisual);
            const overlapDuration = Math.max(0, overlapEnd - overlapStart);

            const audioOffset = event.type === 'skip' ? 0 : overlapStart - eStart;
            const eventAudioStart = (event.audioStartTime || 0) + audioOffset;
            const eventAudioDur = event.type === 'skip' ? 0 : overlapDuration;

            segEvents.push({
              ...event,
              startTime: overlapStart,
              durationSeconds: overlapDuration,
              audioStartTime: eventAudioStart,
              audioDuration: eventAudioDur,
            });
          }
        });

        // Calculate audio bounds directly from playable segEvents
        const playable = segEvents.filter(
          (e) => e.type === 'note' || e.type === 'rest' || e.type === 'hold'
        );
        let segAudioStart = 0;
        let segAudioEnd = 0;
        if (playable.length > 0) {
          segAudioStart = playable[0].audioStartTime || 0;
          const lastEv = playable[playable.length - 1];
          segAudioEnd =
            (lastEv.audioStartTime || 0) + (lastEv.audioDuration || 0);
        } else {
          segAudioStart = segEvents[0]?.audioStartTime || 0;
          segAudioEnd = segAudioStart;
        }

        const startBeat = (cycleBeatOffset % talaCycleBeats) + 1;
        cycleBeatOffset += chunkBeats;

        const showBeatNumbers =
          isLineWrapped ||
          !!parsedData?.directives.visualize_tala ||
          !!parsedData?.directives.viz_tala ||
          !!parsedData?.directives.visualize ||
          isMobile;

        result.push({
          events: segEvents,
          duration: segDuration,
          startTime: segStartVisual,
          originalLineIndex: lineIdx,
          segmentIndex: segIdx,
          startBeatNumber: startBeat,
          beatCount: chunkBeats,
          showBeatNumbers,
          isCommentLine: false,
          audioStartTime: segAudioStart,
          audioEndTime: segAudioEnd,
        });
      });
    });

    return result;
  }, [voiceData, parsedData?.directives, isMobile]);

  const hasWrappedLines = useMemo(() => {
    return displayLines.some((l) => l.showBeatNumbers);
  }, [displayLines]);

  const maxRowBeats = useMemo(() => {
    if (displayLines.length === 0) return voiceData?.beatCount || 8;
    const beatCounts = displayLines
      .filter((l) => !l.isCommentLine)
      .map((l) => l.beatCount);
    return beatCounts.length > 0 ? Math.max(...beatCounts) : 8;
  }, [displayLines, voiceData?.beatCount]);

  const PADDING = isMobile ? 24 : 48;
  const effectiveBeatCount = hasWrappedLines
    ? maxRowBeats
    : (voiceData?.beatCount ?? 0);

  const rawBeatWidth =
    effectiveBeatCount > 0
      ? Math.abs((containerWidth - PADDING) / effectiveBeatCount)
      : 60;

  // Calculate base width (fit to screen logic), then apply zoom
  const minBeatWidth = hasWrappedLines ? 36 : 46;
  const baseBeatWidth = Math.max(minBeatWidth, Math.min(120, rawBeatWidth));
  const BEAT_WIDTH = baseBeatWidth * zoomLevel;

  const PIXELS_PER_SECOND = (BEAT_WIDTH * bpm) / 60;

  // Explicit state for active line index to trigger re-renders only when line changes
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const activeLineIndexRef = useRef(activeLineIndex);

  // Update ref when state changes
  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex]);

  const calculateVisualProgressOffset = useCallback(
    (line: LineData, now: number) => {
      let visualProgressOffset = 0;
      let found = false;

      for (const event of line.events) {
        if (
          event.type === 'comment' ||
          event.type === 'bar' ||
          event.type === 'skip'
        )
          continue;

        const eStart = event.audioStartTime || 0;
        const eDur = event.audioDuration || 0;
        const eEnd = eStart + eDur;

        if (now >= eStart && now < eEnd) {
          // In this event
          const percent = (now - eStart) / (eDur || 0.001); // avoid div by zero
          visualProgressOffset =
            event.startTime - line.startTime + percent * event.durationSeconds;
          found = true;
          break;
        } else if (now >= eEnd) {
          // Past this event
          visualProgressOffset =
            event.startTime - line.startTime + event.durationSeconds;
        }
      }

      // If we finished the line (or are at the exact end), ensure we are at the end visually
      if (!found && line.events.length > 0) {
        const last = line.events[line.events.length - 1];
        if (now >= (last.audioStartTime || 0) + (last.audioDuration || 0)) {
          visualProgressOffset = line.duration;
        }
      }

      return Math.max(0, Math.min(line.duration, visualProgressOffset));
    },
    []
  );

  const updateVisuals = useCallback(
    (overrideTime?: number) => {
      if (!voiceData || displayLines.length === 0) return;

      const now =
        typeof overrideTime === 'number'
          ? overrideTime
          : Tone.getTransport().seconds;
      currentTimeRef.current = now;

      // 1. Calculate active line
      let newActiveLineIdx = -1;
      const lines = displayLines;
      const playableIndices: number[] = [];
      for (let idx = 0; idx < lines.length; idx++) {
        if (
          !lines[idx].isCommentLine &&
          lines[idx].audioEndTime > lines[idx].audioStartTime
        ) {
          playableIndices.push(idx);
        }
      }

      if (playableIndices.length > 0) {
        const firstIdx = playableIndices[0];
        const lastIdx = playableIndices[playableIndices.length - 1];

        if (now <= lines[firstIdx].audioStartTime) {
          newActiveLineIdx = firstIdx;
        } else if (now >= lines[lastIdx].audioEndTime) {
          newActiveLineIdx = lastIdx;
        } else {
          for (const idx of playableIndices) {
            const line = lines[idx];
            if (now >= line.audioStartTime && now <= line.audioEndTime) {
              newActiveLineIdx = idx;
              break;
            }
          }
          if (newActiveLineIdx === -1) {
            for (let i = 0; i < playableIndices.length - 1; i++) {
              const currIdx = playableIndices[i];
              const nextIdx = playableIndices[i + 1];
              if (
                now >= lines[currIdx].audioEndTime &&
                now < lines[nextIdx].audioStartTime
              ) {
                newActiveLineIdx = currIdx;
                break;
              }
            }
          }
        }
      }

      // Synchronously update active line ref and state
      if (newActiveLineIdx !== -1 && newActiveLineIdx !== activeLineIndexRef.current) {
        activeLineIndexRef.current = newActiveLineIdx;
        setActiveLineIndex(newActiveLineIdx);
      }

      // 2. Update Playhead Position directly
      const currentActiveIdx =
        newActiveLineIdx !== -1 ? newActiveLineIdx : activeLineIndexRef.current;
      if (
        playheadRef.current &&
        currentActiveIdx !== -1 &&
        currentActiveIdx < displayLines.length
      ) {
        const line = displayLines[currentActiveIdx];
        const visualProgressOffset = calculateVisualProgressOffset(line, now);

        // Use transform for smooth GPU animation
        playheadRef.current.style.transform = `translateX(${visualProgressOffset * PIXELS_PER_SECOND}px)`;

        // 3. Handle Auto-scroll inside the loop, but don't fight user scrolling.
        if (
          scrollContainerRef.current &&
          Date.now() - lastUserScrollRef.current > 800
        ) {
          const scrollContainer = scrollContainerRef.current;
          if (
            !hasWrappedLines ||
            scrollContainer.scrollWidth > scrollContainer.clientWidth + 5
          ) {
            const playhead = playheadRef.current;
            const lineContainer = playhead.closest('[style*="height"]'); // VisualizerLine container

            if (lineContainer) {
              const playheadRect = playhead.getBoundingClientRect();
              const containerRect = scrollContainer.getBoundingClientRect();
              // Check: where is the playhead relative to the scroll container's view?
              const relativeX = playheadRect.left - containerRect.left;

              // If playhead > 90% of view width (scrolling forward)
              if (relativeX > containerRect.width * 0.9) {
                const currentScroll = scrollContainer.scrollLeft;
                const targetScroll =
                  currentScroll + relativeX - containerRect.width * 0.1;
                scrollContainer.scrollLeft = targetScroll;
              }
              // If playhead < 5% of view width (scrolling backward or just jumped to a new line)
              else if (relativeX < containerRect.width * 0.05) {
                const currentScroll = scrollContainer.scrollLeft;
                // Scroll back so playhead is at 10% from the left
                const targetScroll =
                  currentScroll + relativeX - containerRect.width * 0.1;
                scrollContainer.scrollLeft = Math.max(0, targetScroll);
              }
            }
          }
        }
      }
    },
    [voiceData, displayLines, PIXELS_PER_SECOND, calculateVisualProgressOffset, hasWrappedLines]
  );

  // Initialize active line on load/seek
  useEffect(() => {
    if (!voiceData || displayLines.length === 0) return;
    const playableIndices: number[] = [];
    for (let i = 0; i < displayLines.length; i++) {
      if (
        !displayLines[i].isCommentLine &&
        displayLines[i].audioEndTime > displayLines[i].audioStartTime
      ) {
        playableIndices.push(i);
      }
    }
    if (playableIndices.length === 0) return;

    let idx = playableIndices.find((i) => {
      const line = displayLines[i];
      return (
        initialTime >= line.audioStartTime && initialTime <= line.audioEndTime
      );
    });
    if (idx === undefined) {
      idx = playableIndices[0];
    }

    activeLineIndexRef.current = idx;
    setActiveLineIndex(idx);
    currentTimeRef.current = initialTime;

    // Force direct visual update if paused, so seek updates immediately
    if (!isPlaying) {
      updateVisuals(initialTime);
    }
  }, [initialTime, voiceData, displayLines, isPlaying, updateVisuals]);

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
          behavior: 'smooth',
          block: 'nearest',
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
      className="p-3 md:p-6 bg-card border border-border/40 rounded-xl md:rounded-2xl shadow-sm overflow-hidden max-w-full relative group/viz"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <VisualizerHeader
            parsedData={parsedData}
            isPlaying={isPlaying}
            onPlay={onPlay}
            bpm={bpm}
            setBpm={setBpm}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            isLooping={isLooping}
            onToggleLoop={onToggleLoop}
          />
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onPointerDown={() => {
          lastUserScrollRef.current = Date.now();
        }}
        onWheel={() => {
          lastUserScrollRef.current = Date.now();
        }}
        onTouchStart={() => {
          lastUserScrollRef.current = Date.now();
        }}
        className="overflow-x-auto custom-scrollbar py-5 max-w-full"
      >
        <div className="min-w-max flex flex-col">
          {!hasWrappedLines && (
            <VisualizerBeatNumbers
              beatCount={voiceData?.beatCount ?? 16}
              beatWidth={BEAT_WIDTH}
              zoomLevel={zoomLevel}
            />
          )}

          <div className={hasWrappedLines ? 'pt-2' : 'pt-6'}>
            {displayLines.map((line, idx) => {
              const isActive = idx === activeLineIndex;

              return (
                <VisualizerLine
                  key={idx + '-' + line.startTime}
                  previousLine={idx !== 0 ? displayLines.at(idx - 1) : null}
                  line={line}
                  isActive={isActive}
                  visualProgressOffset={
                    isActive
                      ? calculateVisualProgressOffset(
                          line,
                          currentTimeRef.current
                        )
                      : 0
                  }
                  beatDur={voiceData.beatDur}
                  beatCount={line.beatCount}
                  beatWidth={BEAT_WIDTH}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  onSeek={onSeek}
                  playheadRef={isActive ? playheadRef : undefined}
                  zoomLevel={zoomLevel}
                  startBeatNumber={line.startBeatNumber}
                  showBeatNumbers={line.showBeatNumbers}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
