import { Play, Pause } from "lucide-react";
import { Button } from "../ui/button";
import type { MusicCell as ParsedMusicCell } from "../../utils/sargam_parser";
import { NoteLegendModal } from "./NoteLegendModal";

interface VisualizerHeaderProps {
    parsedData: ParsedMusicCell | null;
    isPlaying: boolean;
    onPlay: () => void;
    bpm: number;
    zoomLevel: number;
    setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
}

export function VisualizerHeader({ parsedData, isPlaying, onPlay, bpm, zoomLevel, setZoomLevel }: VisualizerHeaderProps) {
    return (
        <div className="flex items-start justify-between w-full">
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary/80">
                        {isPlaying ? "Live " : ""}Score
                    </h3>
                    <NoteLegendModal />
                </div>
                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                    {parsedData?.directives.tala || "Free Rhythm"} • {bpm} BPM
                </p>
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg">
                    <button
                        className="p-1 hover:bg-background rounded-md disabled:opacity-50"
                        onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
                        disabled={zoomLevel <= 0.5}
                        title="Zoom Out"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                    </button>
                    <span className="text-xs font-mono w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                    <button
                        className="p-1 hover:bg-background rounded-md disabled:opacity-50"
                        onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))}
                        disabled={zoomLevel >= 3}
                        title="Zoom In"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                    </button>
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
                            <span className="inline">Stop</span>
                        </>
                    ) : (
                        <>
                            <Play className="w-3 h-3 fill-current shrink-0" />{" "}
                            <span className="inline">Play</span>
                        </>
                    )}
                </Button>

            </div>
        </div>
    );
}
