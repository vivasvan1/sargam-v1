import { cn } from "@/lib/utils";

interface VisualizerGridProps {
    beatCount: number;
    beatWidth: number;
    totalBeatsInLine: number;
}

export function VisualizerGrid({ beatCount, beatWidth, totalBeatsInLine }: VisualizerGridProps) {
    const beatMarkers = Array.from({ length: totalBeatsInLine }, (_, i) => i);

    return (
        <div className="absolute inset-0 z-0 pointer-events-none">
            {beatMarkers.map(beatIndex => (
                <div
                    key={beatIndex}
                    className={cn(
                        "absolute top-0 bottom-0 border-l border-border/80",
                        (beatIndex % (beatCount || 4) === 0) ? "border-border border-l-2" : ""
                    )}
                    style={{ left: `${beatIndex * beatWidth}px` }}
                />
            ))}
        </div>
    );
}

interface VisualizerBeatNumbersProps {
    beatCount: number;
    beatWidth: number;
}

export function VisualizerBeatNumbers({ beatCount, beatWidth }: VisualizerBeatNumbersProps) {
    if (beatCount <= 0) return null;

    return (
        <div
            className="grid border-b border-border/10 pb-2"
            style={{
                gridTemplateColumns: `repeat(${beatCount}, ${beatWidth}px)`,
            }}
        >
            {Array.from({ length: beatCount }).map((_, bIdx) => (
                <div
                    key={bIdx}
                    className="text-[9px] font-mono font-bold text-muted-foreground/40 text-center uppercase"
                >
                    {bIdx + 1}
                </div>
            ))}
        </div>
    );
}
