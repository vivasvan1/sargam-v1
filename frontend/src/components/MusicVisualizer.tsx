import React, { useEffect, useRef, useState, useMemo } from "react";
import * as Tone from "tone";
import { Pause, Play, Square } from "lucide-react";
import { cn } from "../lib/utils";
import type { MusicCell as ParsedMusicCell } from "../utils/sargam_parser";
import { Button } from "./ui/button";

interface MusicVisualizerProps {
  parsedData: ParsedMusicCell | null;
  isPlaying: boolean;
  onPlay: () => void;
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

export function MusicVisualizer({ parsedData, isPlaying, onPlay }: MusicVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
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
      setCurrentTime(0);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying]);

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
  const BEAT_WIDTH = Math.max(40, Math.min(80, rawBeatWidth));

  const bpm = parsedData?.directives.tempo
    ? parseFloat(parsedData.directives.tempo)
    : 120;
  const PIXELS_PER_SECOND = (BEAT_WIDTH * bpm) / 60;
  const rowWidth = voiceData.beatCount
    ? voiceData.beatCount * BEAT_WIDTH
    : null;

  return (
    <div
      ref={containerRef}
      className="mt-4 md:mt-6 p-4 md:p-6 bg-card/60 backdrop-blur-xl border border-border/40 rounded-xl md:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-full"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary/80">
            {isPlaying ? "Live " : ""}Score
          </h3>
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
            {parsedData?.directives.tala || "Free Rhythm"} • {bpm} BPM
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 rounded-full border border-border/50">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isPlaying
                  ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]"
                  : "bg-primary"
              )}
            />
            <span className="text-[9px] font-bold tracking-tight text-foreground/70">
              {isPlaying ? "PLAYING" : "IDLE"}
            </span>
          </div>
          <Button
            onClick={onPlay}
            variant={"default"}
            size="sm"
            className={`rounded-full shrink-0`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current shrink-0" />{" "}
                <span className="hidden sm:inline">Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current shrink-0" />{" "}
                <span className="hidden sm:inline">Listen</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto custom-scrollbar px-2 md:px-3 -mx-4 md:-mx-6 max-w-full"
      >
        <div className="min-w-max flex flex-col gap-6 md:gap-8">
          {voiceData.beatCount > 0 && (
            <div
              className="grid border-b border-border/10 pb-2 -mb-6"
              style={{
                gridTemplateColumns: `repeat(${voiceData.beatCount}, ${BEAT_WIDTH}px)`,
                width: `${rowWidth}px`,
              }}
            >
              {Array.from({ length: voiceData.beatCount }).map((_, bIdx) => (
                <div
                  key={bIdx}
                  className="text-[9px] font-mono font-bold text-muted-foreground/40 text-center uppercase"
                >
                  {bIdx + 1}
                </div>
              ))}
            </div>
          )}
          <div className="pt-6">
            {voiceData.lines.map((line, idx) => {
              // Check for comment line
              const isCommentLine = line.events.some(e => e.type === 'comment');

              if (isCommentLine) {
                const commentText = line.events
                  .filter(e => e.type === 'comment')
                  .map(e => (e as any).text)
                  .join(' ')
                  .replace(/^[#\/]+\s*/, '');

                return (
                  <>
                    <div key={idx} className="flex items-center px-2 py-2 pt-6 text-sm text-foreground/80 font-medium italic">
                      {commentText}
                    </div>
                    {voiceData.beatCount > 0 && (
                      <div
                        className="grid border-b border-border/10"
                        style={{
                          gridTemplateColumns: `repeat(${voiceData.beatCount}, ${BEAT_WIDTH}px)`,
                          width: `${rowWidth}px`,
                        }}
                      >
                        {Array.from({ length: voiceData.beatCount }).map((_, bIdx) => (
                          <div
                            key={bIdx}
                            className="text-[9px] font-mono font-bold text-muted-foreground/40 text-center uppercase"
                          >
                            {bIdx + 1}
                          </div>
                        ))}
                      </div>
                    )}
                  </>

                );
              }

              const isActive = idx === activeLineIndex;
              const lineProgress = isActive ? currentTime - line.startTime : 0;

              // Generate beat markers for grid
              const totalBeatsInLine = Math.ceil(line.duration / voiceData.beatDur);
              const beatMarkers = Array.from({ length: totalBeatsInLine }, (_, i) => i);

              return (
                <>
                  <div
                    key={idx}
                    className={cn(
                      "relative group transition-all duration-500",
                      isActive
                        ? "opacity-100"
                        : "opacity-70 blur-[0.3px] hover:opacity-100"
                    )}
                    style={{
                      height: "4rem",
                      width: `${(voiceData.beatCount || Math.ceil(line.duration / voiceData.beatDur) || 4) *
                        BEAT_WIDTH
                        }px`,
                    }}
                  >
                    {/* Grid Overlay */}
                    <div className="absolute inset-0 z-0 pointer-events-none">
                      {beatMarkers.map(beatIndex => (
                        <div
                          key={beatIndex}
                          className={cn(
                            "absolute top-0 bottom-0 border-l border-border/80",
                            (beatIndex % (voiceData.beatCount || 4) === 0) ? "border-border border-l-2" : ""
                          )}
                          style={{ left: `${beatIndex * BEAT_WIDTH}px` }}
                        />
                      ))}
                    </div>

                    {/* Note Overlay */}
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {line.events.map((event, eIdx) => {
                        if (event.type === 'comment') return null;

                        if (event.type === 'bar') {
                          const barEvent = event as any;
                          return (
                            <div
                              key={`bar-${eIdx}`}
                              className={cn(
                                "absolute top-0 bottom-0",
                                barEvent.double
                                  ? "border-l-[3px] border-primary/70 shadow-[1px_0_0_0_rgba(var(--primary),0.3)]"
                                  : "border-l-2 border-primary/50"
                              )}
                              style={{
                                left: `${(event.startTime - line.startTime) * PIXELS_PER_SECOND}px`,
                                height: "100%",
                              }}
                            >
                              {barEvent.double && (
                                <div className="absolute left-[3px] top-0 bottom-0 border-l mr-[2px] border-primary/30 ml-[2px]" />
                              )}
                            </div>
                          );
                        }

                        // Type narrowing
                        const duration = (event as any).duration;
                        if (!('swara' in event) && !duration) return null;

                        const noteEvent = event as any;

                        // Check for meend ornament
                        const meendOrnament = noteEvent.ornaments?.find(
                          (o: any) => o.name === "meend" || o.name === "slide"
                        );
                        const hasMeend =
                          meendOrnament && meendOrnament.params.length > 0;

                        // Parse target swara from meend
                        let targetSwara = null;
                        if (hasMeend) {
                          const targetStr = meendOrnament.params[0]?.trim();
                          if (targetStr) {
                            const upper = targetStr.toUpperCase();
                            if (upper.startsWith("SA")) targetSwara = "S";
                            else if (upper.startsWith("RI")) targetSwara = "R";
                            else if (upper.startsWith("GA")) targetSwara = "G";
                            else if (upper.startsWith("MA")) targetSwara = "M";
                            else if (upper.startsWith("PA")) targetSwara = "P";
                            else if (upper.startsWith("DHA")) targetSwara = "D";
                            else if (upper.startsWith("NI")) targetSwara = "N";
                            else if (targetStr[0]) {
                              const firstChar = targetStr[0].toUpperCase();
                              if (
                                ["S", "R", "G", "M", "P", "D", "N"].includes(
                                  firstChar
                                )
                              ) {
                                targetSwara = firstChar;
                              }
                            }
                          }
                        }

                        if (hasMeend && targetSwara) {
                          return (
                            <div
                              key={eIdx}
                              className="absolute top-[15%] bottom-[15%] rounded-md overflow-hidden transition-all duration-500 shadow-lg bg-linear-to-r from-primary/30 via-primary/15 to-primary/30 border-[1.5px] border-primary/40"
                              style={{
                                left: `${(event.startTime - line.startTime) *
                                  PIXELS_PER_SECOND +
                                  2
                                  }px`,
                                width: `${Math.max(
                                  0,
                                  event.durationSeconds * PIXELS_PER_SECOND - 4
                                )}px`,
                              }}
                            >
                              <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                <span className="text-[10px] font-black text-primary drop-shadow-sm">
                                  {noteEvent.swara}
                                  {noteEvent.variant || ""}
                                </span>
                                {noteEvent.octave !== 0 && (
                                  <span className="text-[7px] opacity-60 ml-0.5">
                                    {noteEvent.octave > 0
                                      ? "'".repeat(noteEvent.octave)
                                      : ",".repeat(Math.abs(noteEvent.octave))}
                                  </span>
                                )}
                              </div>
                              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
                                <svg width="32" height="12" viewBox="0 0 32 12" fill="none" className="text-primary/70">
                                  <path d="M2 6 Q16 2, 28 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M28 6 L24 3.5 L24 8.5 Z" fill="currentColor" stroke="none" />
                                </svg>
                              </div>
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                <span className="text-[10px] font-black text-primary drop-shadow-sm">
                                  {targetSwara}
                                </span>
                              </div>
                              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
                                <span className="text-[6px] font-bold uppercase tracking-wider text-primary/70 bg-primary/10 px-1 py-0.5 rounded">
                                  meend
                                </span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={eIdx}
                            className={cn(
                              "absolute top-[15%] bottom-[15%] rounded-md flex items-center justify-center text-[10px] font-black tracking-tight transition-all duration-500 shadow-sm",
                              noteEvent.swara
                                ? "bg-linear-to-br from-primary/25 to-primary/5 text-primary border border-primary/20"
                                : "bg-muted/10 opacity-20"
                            )}
                            style={{
                              left: `${(event.startTime - line.startTime) *
                                PIXELS_PER_SECOND +
                                2
                                }px`,
                              width: `${Math.max(
                                0,
                                event.durationSeconds * PIXELS_PER_SECOND - 4
                              )}px`,
                            }}
                          >
                            <span className="drop-shadow-sm flex items-center">
                              {noteEvent.swara}
                              {noteEvent.variant || ""}
                              {noteEvent.octave !== 0 && (
                                <span className="opacity-60 ml-0.5">
                                  {noteEvent.octave > 0
                                    ? "'".repeat(noteEvent.octave)
                                    : ",".repeat(Math.abs(noteEvent.octave))}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {isActive && (
                      <div
                        ref={playheadRef}
                        className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-primary z-20 pointer-events-none transition-transform duration-75 ease-linear"
                        style={{
                          left: `${lineProgress * PIXELS_PER_SECOND}px`,
                          boxShadow: "0 0 12px 2px rgba(var(--primary), 0.4)",
                        }}
                      >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                      </div>
                    )}
                  </div>
                </>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
