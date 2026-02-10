import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as Tone from 'tone';
import type { MusicCell as ParsedMusicCell } from '../utils/sargam_parser';
import { VisualizerHeader } from './visualizer/VisualizerHeader';
import { VisualizerBeatNumbers } from './visualizer/VisualizerGrid';
import { VisualizerLine } from './visualizer/VisualizerLine';

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

export function MusicVisualizer({
  parsedData,
  isPlaying,
  onPlay,
  initialTime = 0,
  onSeek,
}: MusicVisualizerProps) {
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
    let currentAudioTime = 0;
    let currentVisualTime = 0;

    const bpm = parsedData.directives.tempo
      ? parseFloat(parsedData.directives.tempo)
      : 120;
    const beatDur = 60 / bpm;

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

      console.log(lines);

      lines[lineIdx].duration += visualDuration;

      if (event.type !== 'comment') {
        currentVisualTime += visualDuration;
        currentAudioTime += audioDuration;
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
      totalDuration: currentAudioTime,
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

  const updateVisuals = useCallback(
    (overrideTime?: number) => {
      if (!voiceData) return;

      const now =
        typeof overrideTime === 'number'
          ? overrideTime
          : Tone.getTransport().seconds;
      currentTimeRef.current = now;

      // 1. Calculate active line
      let newActiveLineIdx = -1;

      // Find line that contains the audio time
      // We need to check audio time ranges of lines
      // Since lines are sequential in time, we can look at the events in them?
      // Actually, voiceData.lines now has 'startTime' as VISUAL start time.
      // We need to infer audio start time range for the line from its events.

      // Optimization: Pre-calculate line audio ranges in useMemo?
      // For now, let's iterate to find the line where:
      // line.firstEvent.audioStartTime <= now <= line.lastEvent.audioEndTime

      // However, voiceData.lines structure only has 'startTime' which is now VISUAL.
      // The events inside have 'audioStartTime'.

      const lines = voiceData.lines;
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        if (line.events.length > 0) {
          const firstEvent = line.events[0];
          const lastEvent = line.events[line.events.length - 1];
          // We need safely cast or check properties
          const startAudio = firstEvent.audioStartTime || 0;
          const endAudio =
            (lastEvent.audioStartTime || 0) + (lastEvent.audioDuration || 0);

          if (now >= startAudio && now <= endAudio) {
            newActiveLineIdx = idx;
            break;
          }
        }
      }

      // Only update state if line changed
      if (newActiveLineIdx !== activeLineIndexRef.current) {
        setActiveLineIndex(newActiveLineIdx);
        return;
      }

      // 2. Update Playhead Position directly
      if (playheadRef.current && newActiveLineIdx !== -1) {
        const line = voiceData.lines[newActiveLineIdx];

        // Calculate visual progress based on audio time "now"
        // We iterate events in the line to find where "now" falls
        let visualProgressOffset = 0;
        let found = false;

        for (const event of line.events) {
          const eStart = event.audioStartTime || 0;
          const eDur = event.audioDuration || 0;
          const eEnd = eStart + eDur;

          if (now >= eStart && now < eEnd) {
            // In this event
            const percent = (now - eStart) / (eDur || 0.001); // avoid div by zero
            visualProgressOffset =
              event.startTime -
              line.startTime +
              percent * event.durationSeconds;
            found = true;
            break;
          } else if (now >= eEnd) {
            // Past this event
            // visualProgressOffset = (event.startTime - line.startTime) + event.durationSeconds;
            // Actually, just taking the end of this event relative to line start
            visualProgressOffset =
              event.startTime - line.startTime + event.durationSeconds;
          }
        }

        // If we finished the line (or are at the exact end), ensure we are at the end visually
        if (!found && line.events.length > 0) {
          // If "now" is exactly the end time, or slightly past due to frame timing
          const last = line.events[line.events.length - 1];
          // Check if we are really past
          if (now >= (last.audioStartTime || 0) + (last.audioDuration || 0)) {
            visualProgressOffset = line.duration;
          }
        }

        // Use transform for smooth GPU animation
        playheadRef.current.style.transform = `translateX(${visualProgressOffset * PIXELS_PER_SECOND}px)`;

        // 3. Handle Auto-scroll inside the loop
        if (scrollContainerRef.current) {
          const scrollContainer = scrollContainerRef.current;
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
    },
    [voiceData, PIXELS_PER_SECOND]
  );

  // Handle seek-on-pause visual update AFTER line change has mounted
  useEffect(() => {
    if (!isPlaying && activeLineIndex !== -1) {
      // Small delay to ensure the playhead Ref is available in the new line
      const timeout = setTimeout(() => {
        updateVisuals(currentTimeRef.current);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [activeLineIndex, isPlaying, updateVisuals]);

  // Initialize active line on load/seek
  useEffect(() => {
    if (!voiceData) return;
    const idx = voiceData.lines.findIndex((line) => {
      if (line.events.length === 0) return false;
      const startAudio = line.events[0].audioStartTime || 0;
      const lastEvent = line.events[line.events.length - 1];
      const endAudio =
        (lastEvent.audioStartTime || 0) + (lastEvent.audioDuration || 0);
      return initialTime >= startAudio && initialTime <= endAudio;
    });
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
