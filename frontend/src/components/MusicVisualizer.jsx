import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as Tone from 'tone';
import { cn } from '../lib/utils';

export function MusicVisualizer({ parsedData, isPlaying }) {
    const containerRef = useRef(null);
    const [currentTime, setCurrentTime] = useState(0);
    const requestRef = useRef();

    // Group events by line_index for the first voice (primary visual)
    const voiceData = useMemo(() => {
        if (!parsedData || !parsedData.voices) return null;
        const mainVoice = Object.values(parsedData.voices)[0];
        if (!mainVoice) return null;

        const lines = {};
        let absTime = 0;
        const bpm = parsedData.directives.tempo ? parseFloat(parsedData.directives.tempo) : 120;
        const beatDur = 60 / bpm;

        mainVoice.events.forEach(event => {
            if (event.duration === undefined) return;

            const lineIdx = event.line_index || 0;
            if (!lines[lineIdx]) lines[lineIdx] = { events: [], duration: 0, startTime: absTime };

            const durationSeconds = event.duration * beatDur;
            lines[lineIdx].events.push({
                ...event,
                startTime: absTime,
                durationSeconds
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
            beatCount
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
                containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            cancelAnimationFrame(requestRef.current);
            setCurrentTime(0);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying]);

    if (!voiceData || !isPlaying) return null;

    // Find current active line based on currentTime
    const activeLineIndex = voiceData.lines.findIndex(line =>
        currentTime >= line.startTime && currentTime <= (line.startTime + line.duration)
    );

    // Dynamic BEAT_WIDTH calculation:
    // Try to fit the beat count in the container width, but stay between 40px and 80px.
    // If no beatCount, default to 60px.
    const PADDING = 48; // total horizontal padding
    const rawBeatWidth = voiceData.beatCount > 0
        ? (containerWidth - PADDING) / voiceData.beatCount
        : 60;
    const BEAT_WIDTH = Math.max(40, Math.min(80, rawBeatWidth));

    const bpm = parsedData.directives.tempo ? parseFloat(parsedData.directives.tempo) : 120;
    const PIXELS_PER_SECOND = (BEAT_WIDTH * bpm) / 60;
    const rowWidth = voiceData.beatCount ? (voiceData.beatCount * BEAT_WIDTH) : null;

    return (
        <div
            ref={containerRef}
            className="mt-6 p-6 bg-card/60 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700"
        >
            <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary/80">
                        Live Score
                    </h3>
                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                        {parsedData.directives.tala || 'Free Rhythm'} • {bpm} BPM
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 rounded-full border border-border/50">
                    <div className={cn(
                        "w-2 h-2 rounded-full animate-pulse",
                        isPlaying ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" : "bg-muted"
                    )} />
                    <span className="text-[9px] font-bold tracking-tight text-foreground/70">
                        {isPlaying ? "PLAYING" : "IDLE"}
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto pb-6 custom-scrollbar">
                <div className="min-w-max flex flex-col gap-8">
                    {/* Table Header: Beat Numbers */}
                    {voiceData.beatCount > 0 && (
                        <div
                            className="grid border-b border-border/10 pb-2 -mb-6"
                            style={{
                                gridTemplateColumns: `repeat(${voiceData.beatCount}, ${BEAT_WIDTH}px)`,
                                width: `${rowWidth}px`
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
                            const lineProgress = isActive ? (currentTime - line.startTime) : 0;

                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        "relative group transition-all duration-500",
                                        isActive ? "opacity-100 scale-[1.01]" : "opacity-30 blur-[0.3px] hover:opacity-50"
                                    )}
                                >
                                    {/* The Table Grid */}
                                    <div
                                        className={cn(
                                            "grid border border-border/30 rounded-lg overflow-hidden bg-muted/5",
                                            isActive && "border-primary/30 shadow-[0_4px_20px_rgba(var(--primary),0.03)] bg-primary/2"
                                        )}
                                        style={{
                                            gridTemplateColumns: `repeat(${voiceData.beatCount || Math.ceil(line.duration)}, ${BEAT_WIDTH}px)`,
                                            height: '4rem'
                                        }}
                                    >
                                        {Array.from({ length: voiceData.beatCount || Math.ceil(line.duration) }).map((_, bIdx) => (
                                            <div
                                                key={bIdx}
                                                className="border-r border-border/10 last:border-r-0 h-full w-full"
                                            />
                                        ))}
                                    </div>

                                    {/* Note Overlay */}
                                    <div className="absolute inset-0 z-10 pointer-events-none">
                                        {line.events.map((event, eIdx) => {
                                            if (!event.swara && !event.duration) return null;

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
                                                        left: `${(event.startTime - line.startTime) * PIXELS_PER_SECOND + 2}px`,
                                                        width: `${Math.max(0, event.durationSeconds * PIXELS_PER_SECOND - 4)}px`
                                                    }}
                                                >
                                                    <span className="drop-shadow-sm">
                                                        {event.swara}{event.variant || ''}
                                                    </span>
                                                    {event.octave !== 0 && (
                                                        <span className="absolute top-0.5 right-1 text-[7px] opacity-60">
                                                            {event.octave > 0 ? "'".repeat(event.octave) : ",".repeat(Math.abs(event.octave))}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Playhead */}
                                    {isActive && (
                                        <div
                                            className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-primary z-20 pointer-events-none transition-transform duration-75 ease-linear"
                                            style={{
                                                left: `${lineProgress * PIXELS_PER_SECOND}px`,
                                                boxShadow: '0 0 12px 2px rgba(var(--primary), 0.4)'
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
