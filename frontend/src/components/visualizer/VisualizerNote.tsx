import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotebookSettings } from "@/context/NotebookSettingsContext";

interface NoteEvent {
    swara?: string;
    variant?: string;
    octave?: number;
    duration?: number;
    startTime: number;
    durationSeconds: number;
    ornaments?: any[];
    [key: string]: any;
}

interface VisualizerNoteProps {
    event: NoteEvent;
    lineStartTime: number;
    pixelsPerSecond: number;
    onSeek?: (time: number) => void;
}

const SWARA_NAMES: Record<string, string> = {
    "S": "Sa",
    "R": "Re",
    "G": "Ga",
    "M": "Ma",
    "P": "Pa",
    "D": "Dha",
    "N": "Ni",
};

const SWARA_NAMES_HI: Record<string, string> = {
    "S": "सा",
    "R": "रे",
    "G": "गा",
    "M": "मा",
    "P": "पा",
    "D": "धा",
    "N": "नी",
};

export function VisualizerNote({ event, lineStartTime, pixelsPerSecond, onSeek }: VisualizerNoteProps) {
    const { language } = useNotebookSettings();

    // Check for meend ornament
    const meendOrnament = event.ornaments?.find(
        (o: any) => o.name === "meend" || o.name === "slide"
    );
    const hasMeend = meendOrnament && meendOrnament.params.length > 0;

    // Parse target swara from meend
    let targetSwara = null;
    let targetOctave = 0;
    let targetVariant = "";

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
                const firstChar = targetStr[0];
                if (["S", "R", "G", "M", "P", "D", "N", "m"].includes(firstChar)) {
                    targetSwara = firstChar === 'm' ? 'M' : firstChar;
                } else {
                    const upperFirst = firstChar.toUpperCase();
                    if (["S", "R", "G", "M", "P", "D", "N"].includes(upperFirst)) {
                        targetSwara = upperFirst;
                    }
                }
            }

            // Parse target variant
            if (targetStr.includes("k") || targetStr.includes("b")) targetVariant = "k";
            else if (targetStr.includes("t") || targetStr.includes("#")) targetVariant = "t";

            // Parse target octave
            const octaveUp = (targetStr.match(/'/g) || []).length;
            const octaveDown = (targetStr.match(/,/g) || []).length;
            targetOctave = octaveUp - octaveDown;
        }
    }

    const leftPosition = (event.startTime - lineStartTime) * pixelsPerSecond + 2;
    const width = Math.max(0, event.durationSeconds * pixelsPerSecond - 4);

    const getOctaveMarks = (octave: number) => {
        if (octave === 0) return null;
        return octave > 0 ? "'".repeat(octave) : ",".repeat(Math.abs(octave));
    };

    const getNoteLabel = (swara: string | undefined, variant: string | undefined, octave: number | undefined) => {
        if (!swara) return "";
        let name = (language === 'hi' ? SWARA_NAMES_HI[swara] : SWARA_NAMES[swara]) || swara;

        let label = name;
        if (variant === 'k' || variant === 'b') label += " (Komal)";
        else if (variant === 't' || variant === '#' || variant === 'Mt') label += " (Tivra)";

        if (octave && octave !== 0) {
            label += ` ${octave > 0 ? "+" : ""}${octave}`;
        }
        return label;
    };

    const [open, setOpen] = useState(false);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = useRef(false);
    const handleTouchStart = useCallback(() => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setOpen(true);
            // setTimeout(() => setOpen(false), 1000);
        }, 500);
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleClick = useCallback(() => {
        if (isLongPress.current) {
            isLongPress.current = false;
            return;
        }
        onSeek?.(event.startTime);
    }, [event.startTime, onSeek]);

    if (hasMeend && targetSwara) {
        const displaySwaraStart = (language === 'hi' ? SWARA_NAMES_HI[event.swara || ""] : event.swara) || event.swara;
        const displaySwaraEnd = (language === 'hi' ? SWARA_NAMES_HI[targetSwara || ""] : targetSwara) || targetSwara;

        const isKomalStart = (event.variant === 'k' || event.variant === 'b');
        const isKomalEnd = (targetVariant === 'k' || targetVariant === 'b');

        const isHindi = language === 'hi';

        return (
            <Tooltip delayDuration={0} open={open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>
                    <div
                        className="absolute top-[15%] bottom-[15%] rounded-md overflow-hidden transition-all duration-500 shadow-lg bg-linear-to-r from-primary/30 via-primary/15 to-primary/30 border-[1.5px] border-primary/40 cursor-pointer pointer-events-auto hover:border-primary/60 select-none"
                        onClick={handleClick}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchMove}
                        style={{
                            left: `${leftPosition}px`,
                            width: `${width}px`,
                        }}
                    >
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                            <span className={cn("text-[10px] font-black text-primary drop-shadow-sm", isHindi && isKomalStart && "underline decoration-2 underline-offset-2")}>
                                {displaySwaraStart}
                                {!isHindi && event.variant || ""}
                            </span>
                            {event.octave !== 0 && (
                                <span className="text-[7px] opacity-60 ml-0.5">
                                    {getOctaveMarks(event.octave!)}
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
                            <span className={cn("text-[10px] font-black text-primary drop-shadow-sm", isHindi && isKomalEnd && "underline decoration-2 underline-offset-2")}>
                                {displaySwaraEnd}
                                {!isHindi && targetVariant}
                            </span>
                            {targetOctave !== 0 && (
                                <span className="text-[7px] opacity-60 ml-0.5">
                                    {getOctaveMarks(targetOctave)}
                                </span>
                            )}
                        </div>
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
                            <span className="text-[6px] font-bold uppercase tracking-wider text-primary/70 bg-primary/10 px-1 py-0.5 rounded">
                                meend
                            </span>
                        </div>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                    {getNoteLabel(event.swara, event.variant, event.octave)}
                    {" → "}
                    {getNoteLabel(targetSwara, targetVariant, targetOctave)}
                </TooltipContent>
            </Tooltip>
        );
    }

    if (event.swara === '^') {
        return (
            <Tooltip delayDuration={0} open={open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "absolute top-[10%] bottom-[10%] w-[4px] rounded-full transition-all duration-500 cursor-help pointer-events-auto select-none",
                            "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                        )}
                        onClick={handleClick}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchMove}
                        style={{
                            left: `${leftPosition}px`,
                        }}
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[8px] h-[8px] bg-amber-400/30 rounded-full animate-ping" />
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                    Chikari
                </TooltipContent>
            </Tooltip>
        );
    }

    const displaySwara = (language === 'hi' ? SWARA_NAMES_HI[event.swara || ""] : event.swara) || event.swara;
    const isKomal = (event.variant === 'k' || event.variant === 'b');
    const isHindi = language === 'hi';
    const showUnderline = isHindi && isKomal;

    return (
        <Tooltip delayDuration={0} open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
                <div
                    className={cn(
                        "absolute top-[15%] bottom-[15%] rounded-md flex items-center justify-center text-[10px] font-black tracking-tight transition-all duration-500 shadow-sm cursor-pointer pointer-events-auto hover:border-primary/50 select-none",
                        event.swara
                            ? "bg-linear-to-br from-primary/25 to-primary/5 text-primary border border-primary/20"
                            : "bg-muted/10 border border-transparent opacity-40 hover:opacity-60"
                    )}
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    style={{
                        left: `${leftPosition}px`,
                        width: `${width}px`,
                    }}
                >
                    <span className={cn("drop-shadow-sm flex items-center", showUnderline && "underline decoration-2 underline-offset-2")}>
                        {displaySwara}
                        {!isHindi && event.variant || ""}
                        {event.octave !== 0 && (
                            <span className="opacity-60 ml-0.5">
                                {getOctaveMarks(event.octave!)}
                            </span>
                        )}
                    </span>
                </div>
            </TooltipTrigger>
            {event.swara && (
                <TooltipContent side="top">
                    {getNoteLabel(event.swara, event.variant, event.octave)}
                </TooltipContent>
            )}
        </Tooltip>
    );
}
