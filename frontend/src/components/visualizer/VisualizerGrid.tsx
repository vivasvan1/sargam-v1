import { memo } from "react";
import { cn } from "@/lib/utils";

interface VisualizerGridProps {
    beatCount: number;
    beatWidth: number;
}

export const VisualizerGrid = memo(function VisualizerGrid({
    beatCount,
    beatWidth,
}: VisualizerGridProps) {
    const beatMarkers = Array.from({ length: beatCount + 1 }, (_, i) => i);

    return (
        <div className="absolute inset-0 z-0 pointer-events-none">
            {beatMarkers.map((beatIndex) => (
                <div
                    key={beatIndex}
                    className={cn(
                        "absolute top-0 bottom-0 border-l border-border",
                        beatIndex % (beatCount || 4) === 0
                            ? "border-border border-l"
                            : "",
                    )}
                    style={{ left: `${(beatIndex * beatWidth) - ((beatIndex == beatCount) ? 1 : 0)}px` }}
                />
            ))}
        </div>
    );
});

interface VisualizerBeatNumbersProps {
    beatCount: number;
    beatWidth: number;
    zoomLevel: number;
}

export const VisualizerBeatNumbers = memo(function VisualizerBeatNumbers({
    beatCount,
    beatWidth,
    zoomLevel,
}: VisualizerBeatNumbersProps) {
    if (beatCount <= 0) return null;

    return (
        <div
            className="grid border-b border-border/10"
            style={{
                gridTemplateColumns: `repeat(${beatCount}, ${beatWidth}px)`,
            }}
        >
            {Array.from({ length: beatCount }).map((_, bIdx) => (
                <div
                    key={bIdx}
                    className={`font-mono font-bold text-muted-foreground/40 text-center border-border border-l pb-2 last:border-r uppercase ${zoomLevel <= 1
                        ? "text-xs"
                        : zoomLevel <= 1.5
                            ? "text-sm"
                            : zoomLevel <= 2
                                ? "text-sm"
                                : "text-sm"}`}
                >
                    {bIdx + 1}
                </div>
            ))}
        </div>
    );
});
