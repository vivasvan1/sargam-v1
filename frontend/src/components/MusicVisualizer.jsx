import React, { useEffect, useRef, useState, useMemo } from "react";
import * as Tone from "tone";
import { cn } from "../lib/utils";

export function MusicVisualizer({ parsedData, isPlaying }) {
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const playheadRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const requestRef = useRef();

  // Group events by line_index for the first voice (primary visual)
  const voiceData = useMemo(() => {
    if (!parsedData || !parsedData.voices) return null;
    const mainVoice = Object.values(parsedData.voices)[0];
    if (!mainVoice) return null;

    const lines = {};
    let absTime = 0;
    const bpm = parsedData.directives.tempo
      ? parseFloat(parsedData.directives.tempo)
      : 120;
    const beatDur = 60 / bpm;

    mainVoice.events.forEach((event) => {
      if (event.duration === undefined) return;

      const lineIdx = event.line_index || 0;
      if (!lines[lineIdx])
        lines[lineIdx] = { events: [], duration: 0, startTime: absTime };

      const durationSeconds = event.duration * beatDur;
      lines[lineIdx].events.push({
        ...event,
        startTime: absTime,
        durationSeconds,
      });
      lines[lineIdx].duration += durationSeconds;
      absTime += durationSeconds;
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
      cancelAnimationFrame(requestRef.current);
      setCurrentTime(0);
    }
    return () => cancelAnimationFrame(requestRef.current);
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

  if (!voiceData || !isPlaying) return null;

  // Dynamic BEAT_WIDTH calculation:
  // Try to fit the beat count in the container width, but stay between 40px and 80px.
  // If no beatCount, default to 60px.
  const PADDING = 48; // total horizontal padding
  const rawBeatWidth =
    voiceData.beatCount > 0
      ? (containerWidth - PADDING) / voiceData.beatCount
      : 60;
  const BEAT_WIDTH = Math.max(40, Math.min(80, rawBeatWidth));

  const bpm = parsedData.directives.tempo
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
            Live Score
          </h3>
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
            {parsedData.directives.tala || "Free Rhythm"} • {bpm} BPM
          </p>
        </div>
        <div className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 rounded-full border border-border/50">
          <div
            className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              isPlaying
                ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"
                : "bg-muted"
            )}
          />
          <span className="text-[9px] font-bold tracking-tight text-foreground/70">
            {isPlaying ? "PLAYING" : "IDLE"}
          </span>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto custom-scrollbar px-2 md:px-3 -mx-4 md:-mx-6 max-w-full"
      >
        <div className="min-w-max flex flex-col gap-6 md:gap-8">
          {/* Table Header: Beat Numbers */}
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

          {/* Table Rows */}
          <div className="space-y-6 pt-6">
            {voiceData.lines.map((line, idx) => {
              const isActive = idx === activeLineIndex;
              const lineProgress = isActive ? currentTime - line.startTime : 0;

              return (
                <div
                  key={idx}
                  className={cn(
                    "relative group transition-all duration-500",
                    isActive
                      ? "opacity-100 scale-[1.01]"
                      : "opacity-30 blur-[0.3px] hover:opacity-50"
                  )}
                  style={{
                    height: "4rem",
                    width: `${
                      (voiceData.beatCount || Math.ceil(line.duration)) *
                      BEAT_WIDTH
                    }px`,
                  }}
                >
                  {/* Note Overlay */}
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    {line.events.map((event, eIdx) => {
                      if (!event.swara && !event.duration) return null;

                      // Check for meend ornament
                      const meendOrnament = event.ornaments?.find(
                        (o) => o.name === "meend" || o.name === "slide"
                      );
                      const hasMeend =
                        meendOrnament && meendOrnament.params.length > 0;

                      // Parse target swara from meend params
                      let targetSwara = null;
                      if (hasMeend) {
                        const targetStr = meendOrnament.params[0]?.trim();
                        if (targetStr) {
                          // Extract swara name (first letter or multi-char like SA, RI, etc.)
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
                        // Render meend with special styling
                        return (
                          <div
                            key={eIdx}
                            className="absolute top-[15%] bottom-[15%] rounded-md overflow-hidden transition-all duration-500 shadow-lg bg-gradient-to-r from-primary/30 via-primary/15 to-primary/30 border-[1.5px] border-primary/40"
                            style={{
                              left: `${
                                (event.startTime - line.startTime) *
                                  PIXELS_PER_SECOND +
                                2
                              }px`,
                              width: `${Math.max(
                                0,
                                event.durationSeconds * PIXELS_PER_SECOND - 4
                              )}px`,
                            }}
                          >
                            {/* Start swara */}
                            <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                              <span className="text-[10px] font-black text-primary drop-shadow-sm">
                                {event.swara}
                                {event.variant || ""}
                              </span>
                              {event.octave !== 0 && (
                                <span className="text-[7px] opacity-60">
                                  {event.octave > 0
                                    ? "'".repeat(event.octave)
                                    : ",".repeat(Math.abs(event.octave))}
                                </span>
                              )}
                            </div>

                            {/* Arrow/connector - curved line with arrow */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
                              <svg
                                width="32"
                                height="12"
                                viewBox="0 0 32 12"
                                fill="none"
                                className="text-primary/70"
                              >
                                {/* Curved path from left to right */}
                                <path
                                  d="M2 6 Q16 2, 28 6"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                {/* Arrowhead - filled triangle for better visibility */}
                                <path
                                  d="M28 6 L24 3.5 L24 8.5 Z"
                                  fill="currentColor"
                                  stroke="none"
                                />
                              </svg>
                            </div>

                            {/* Target swara */}
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                              <span className="text-[10px] font-black text-primary drop-shadow-sm">
                                {targetSwara}
                              </span>
                            </div>

                            {/* Meend indicator badge */}
                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
                              <span className="text-[6px] font-bold uppercase tracking-wider text-primary/70 bg-primary/10 px-1 py-0.5 rounded">
                                meend
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // Regular note rendering
                      return (
                        <div
                          key={eIdx}
                          className={cn(
                            "absolute top-[15%] bottom-[15%] rounded-md flex items-center justify-center text-[10px] font-black tracking-tight transition-all duration-500 shadow-sm",
                            event.swara
                              ? "bg-linear-to-br from-primary/25 to-primary/5 text-primary border border-primary/20"
                              : "bg-muted/10 opacity-20"
                          )}
                          style={{
                            left: `${
                              (event.startTime - line.startTime) *
                                PIXELS_PER_SECOND +
                              2
                            }px`,
                            width: `${Math.max(
                              0,
                              event.durationSeconds * PIXELS_PER_SECOND - 4
                            )}px`,
                          }}
                        >
                          <span className="drop-shadow-sm">
                            {event.swara}
                            {event.variant || ""}
                          </span>
                          {event.octave !== 0 && (
                            <span className="absolute top-0.5 right-1 text-[7px] opacity-60">
                              {event.octave > 0
                                ? "'".repeat(event.octave)
                                : ",".repeat(Math.abs(event.octave))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Playhead */}
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
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(var(--primary), 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(var(--primary), 0.2);
        }
      `}</style>
    </div>
  );
}
