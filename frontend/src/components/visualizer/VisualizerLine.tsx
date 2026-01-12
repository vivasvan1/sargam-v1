import { cn } from "@/lib/utils";
import { VisualizerBeatNumbers, VisualizerGrid } from "./VisualizerGrid";
import { VisualizerNote } from "./VisualizerNote";
import { VisualizerBar } from "./VisualizerBar";
import { VisualizerPlayhead } from "./VisualizerPlayhead";

interface VisualizerLineProps {
    line: {
        events: any[];
        duration: number;
        startTime: number;
    };
    isActive: boolean;
    currentTime: number;
    beatDur: number;
    beatCount: number;
    beatWidth: number;
    pixelsPerSecond: number;
    onSeek?: (time: number) => void;
    playheadRef?: React.RefObject<HTMLDivElement | null>;
}

export function VisualizerLine({
    line,
    isActive,
    currentTime,
    beatDur,
    beatCount,
    beatWidth,
    pixelsPerSecond,
    onSeek,
    playheadRef
}: VisualizerLineProps) {
    const isCommentLine = line.events.some(e => e.type === 'comment');

    if (isCommentLine) {
        const commentText = line.events
            .filter(e => e.type === 'comment')
            .map(e => (e as any).text)
            .join(' ')
            .replace(/^[#\/]+\s*/, '');

        return (
            <div className="flex flex-col">
                <div className="flex text-sm text-foreground/80 font-extrabold italic py-5">
                    {commentText}
                </div>
                <VisualizerBeatNumbers
                    beatCount={beatCount}
                    beatWidth={beatWidth}
                />
            </div>
        );
    }

    const lineProgress = isActive ? currentTime - line.startTime : 0;
    const totalBeatsInLine = Math.ceil(line.duration / beatDur);
    const lineWidth = (beatCount || totalBeatsInLine || 4) * beatWidth;

    return (
        <div
            className={cn(
                "relative group transition-all duration-500",
                isActive
                    ? "opacity-100"
                    : "opacity-70 blur-[0.3px] hover:opacity-100"
            )}
            style={{
                height: "4rem",
                width: `${lineWidth}px`,
            }}
        >
            <VisualizerGrid
                beatCount={beatCount}
                beatWidth={beatWidth}
                totalBeatsInLine={totalBeatsInLine}
            />

            <div className="absolute inset-0 z-10 pointer-events-none">
                {line.events.map((event, eIdx) => {
                    if (event.type === 'comment') return null;

                    if (event.type === 'bar') {
                        return (
                            <VisualizerBar
                                key={`bar-${eIdx}`}
                                event={event}
                                lineStartTime={line.startTime}
                                pixelsPerSecond={pixelsPerSecond}
                                onSeek={onSeek}
                            />
                        );
                    }

                    const duration = (event as any).duration;
                    if (!('swara' in event) && !duration) return null;

                    return (
                        <VisualizerNote
                            key={eIdx}
                            event={event}
                            lineStartTime={line.startTime}
                            pixelsPerSecond={pixelsPerSecond}
                            onSeek={onSeek}
                        />
                    );
                })}
            </div>

            {isActive && (
                <VisualizerPlayhead
                    ref={playheadRef}
                    lineProgress={lineProgress}
                    pixelsPerSecond={pixelsPerSecond}
                />
            )}
        </div>
    );
}
