import { Play, Pause } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { MusicCell as ParsedMusicCell } from "../../utils/sargam_parser";

interface VisualizerHeaderProps {
    parsedData: ParsedMusicCell | null;
    isPlaying: boolean;
    onPlay: () => void;
    bpm: number;
}

export function VisualizerHeader({ parsedData, isPlaying, onPlay, bpm }: VisualizerHeaderProps) {
    return (
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
    );
}
