import React from "react";
import { Play, Square, Settings2, Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface ControlsProps {
    isPlaying: boolean;
    onPlay: () => void;
    mixerOpen: boolean;
    onToggleMixer: () => void;
    mixerContent: React.ReactNode;
    showVisualizer?: boolean;
    onToggleVisualizer?: () => void;
}

export function Controls({
    isPlaying,
    onPlay,
    mixerOpen,
    onToggleMixer,
    mixerContent,
    showVisualizer,
    onToggleVisualizer
}: ControlsProps) {
    return (
        <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-muted/10 border-b border-border min-w-0">
            <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                <Button
                    onClick={onPlay}
                    variant={isPlaying ? "destructive" : "default"}
                    size="sm"
                    className="rounded-full shrink-0"
                >
                    {isPlaying ? (
                        <>
                            <Square className="w-3 h-3 fill-current shrink-0" />{" "}
                            <span className="hidden sm:inline">Stop</span>
                        </>
                    ) : (
                        <>
                            <Play className="w-3 h-3 fill-current shrink-0" />{" "}
                            <span className="hidden sm:inline">Play</span>
                        </>
                    )}
                </Button>

                <div className="relative shrink-0">
                    <Button
                        onClick={onToggleMixer}
                        variant="ghost"
                        size="icon-sm"
                        className={cn(
                            "rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 touch-manipulation",
                            mixerOpen && "bg-muted text-primary"
                        )}
                        title="Instrument Mixer"
                        aria-label="Toggle mixer"
                    >
                        <Settings2 className="w-4 h-4" />
                    </Button>

                    {mixerContent}
                </div>

                {onToggleVisualizer && (
                    <Button
                        onClick={onToggleVisualizer}
                        variant="ghost"
                        size="icon-sm"
                        className={cn(
                            "rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 touch-manipulation",
                            showVisualizer && "bg-muted text-primary"
                        )}
                        title={showVisualizer ? "Hide Visualizer" : "Show Visualizer"}
                        aria-label="Toggle visualizer"
                    >
                        {showVisualizer ? (
                            <Eye className="w-4 h-4" />
                        ) : (
                            <EyeOff className="w-4 h-4" />
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
}
