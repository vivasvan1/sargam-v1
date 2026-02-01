import { Volume2, VolumeX, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { INSTRUMENTS } from "../../lib/instruments";
import { type MusicCell as ParsedMusicCell } from "../../utils/sargam_parser";

export interface VoiceControl {
    volume: number;
    muted: boolean;
    instrument: string;
    chikariVolume?: number;
    chikariMuted?: boolean;
}

interface MixerProps {
    show: boolean;
    onClose: () => void;
    voiceControls: Record<string, VoiceControl>;
    updateVoiceControl: (voiceName: string, updates: Partial<VoiceControl>) => void;
    parsedData: ParsedMusicCell | null;
}

export function Mixer({
    show,
    onClose,
    voiceControls,
    updateVoiceControl,
    parsedData
}: MixerProps) {
    if (!show) return null;

    return (
        <div className="absolute z-9999 w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-[288px] md:w-72 bg-popover border border-border rounded-lg shadow-lg p-3 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100vh-6rem)] md:max-h-[calc(100vh-8rem)]">
            <div className="flex items-center justify-between mb-2 shrink-0">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Mixer
                </h4>
                <Button
                    onClick={onClose}
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 min-w-[32px] min-h-[32px] touch-manipulation"
                    aria-label="Close mixer"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                {/* Tala Control */}
                {parsedData?.directives?.tala && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                                <span className="text-xs font-medium">
                                    Tala (Rhythm)
                                </span>
                                <select
                                    className="text-[10px] h-6 bg-muted/50 border-none rounded px-1 min-w-0"
                                    value={
                                        voiceControls["__tala"]?.instrument || "tabla"
                                    }
                                    onChange={(e) =>
                                        updateVoiceControl("__tala", {
                                            instrument: e.target.value,
                                        })
                                    }
                                >
                                    {Object.values(INSTRUMENTS)
                                        .filter((i) => i.category === "rhythm")
                                        .map((inst) => (
                                            <option key={inst.id} value={inst.id}>
                                                {inst.name}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <Button
                                onClick={() =>
                                    updateVoiceControl("__tala", {
                                        muted: !voiceControls["__tala"]?.muted,
                                    })
                                }
                                variant="ghost"
                                size="icon-sm"
                                className={cn(
                                    voiceControls["__tala"]?.muted && "text-destructive"
                                )}
                            >
                                {voiceControls["__tala"]?.muted ? (
                                    <VolumeX className="w-3 h-3" />
                                ) : (
                                    <Volume2 className="w-3 h-3" />
                                )}
                            </Button>
                        </div>
                        <input
                            type="range"
                            min="-30"
                            max="0"
                            step="1"
                            value={voiceControls["__tala"]?.volume ?? -5}
                            onChange={(e) =>
                                updateVoiceControl("__tala", {
                                    volume: parseFloat(e.target.value),
                                })
                            }
                            className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                            disabled={voiceControls["__tala"]?.muted}
                        />
                    </div>
                )}

                {/* Voice Controls */}
                {Object.keys(voiceControls)
                    .filter((k) => k !== "__tala")
                    .map((v) => (
                        <div
                            key={v}
                            className="space-y-1.5 pt-1 border-t border-border/50 first:border-0 first:pt-0"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                                    <span className="text-xs font-medium uppercase truncate">
                                        {v}
                                    </span>
                                    <select
                                        className="text-[10px] h-6 bg-muted/50 border-none rounded px-1 min-w-0"
                                        value={voiceControls[v]?.instrument || "synth"}
                                        onChange={(e) =>
                                            updateVoiceControl(v, {
                                                instrument: e.target.value,
                                            })
                                        }
                                    >
                                        {Object.values(INSTRUMENTS)
                                            .filter((i) => i.category === "melody")
                                            .map((inst) => (
                                                <option key={inst.id} value={inst.id}>
                                                    {inst.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <Button
                                        onClick={() =>
                                            updateVoiceControl(v, {
                                                muted: !voiceControls[v]?.muted,
                                            })
                                        }
                                        variant="ghost"
                                        size="icon-sm"
                                        className={cn(
                                            voiceControls[v]?.muted && "text-destructive"
                                        )}
                                    >
                                        {voiceControls[v]?.muted ? (
                                            <VolumeX className="w-3 h-3" />
                                        ) : (
                                            <Volume2 className="w-3 h-3" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <input
                                type="range"
                                min="-30"
                                max="0"
                                step="1"
                                value={voiceControls[v]?.volume ?? -5}
                                onChange={(e) =>
                                    updateVoiceControl(v, {
                                        volume: parseFloat(e.target.value),
                                    })
                                }
                                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                disabled={voiceControls[v]?.muted}
                            />

                            {/* Chikari Control - Only for Sitar */}
                            {voiceControls[v]?.instrument === "sitar-sampler" && (
                                <div className="mt-2 pl-4 border-l-2 border-primary/20 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                            Chikari
                                        </span>
                                        <Button
                                            onClick={() =>
                                                updateVoiceControl(v, {
                                                    chikariMuted: !voiceControls[v]?.chikariMuted,
                                                })
                                            }
                                            variant="ghost"
                                            size="icon-sm"
                                            className={cn(
                                                "h-5 w-5",
                                                voiceControls[v]?.chikariMuted && "text-destructive"
                                            )}
                                        >
                                            {voiceControls[v]?.chikariMuted ? (
                                                <VolumeX className="w-2.5 h-2.5" />
                                            ) : (
                                                <Volume2 className="w-2.5 h-2.5" />
                                            )}
                                        </Button>
                                    </div>
                                    <input
                                        type="range"
                                        min="-30"
                                        max="0"
                                        step="1"
                                        value={voiceControls[v]?.chikariVolume ?? -5}
                                        onChange={(e) =>
                                            updateVoiceControl(v, {
                                                chikariVolume: parseFloat(e.target.value),
                                            })
                                        }
                                        className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary/70"
                                        disabled={voiceControls[v]?.chikariMuted}
                                    />
                                </div>
                            )}
                        </div>
                    ))}

                {Object.keys(voiceControls).length === 0 && (
                    <div className="text-xs text-muted-foreground italic text-center py-2">
                        No instruments detected
                    </div>
                )}
            </div>
        </div>
    );
}
