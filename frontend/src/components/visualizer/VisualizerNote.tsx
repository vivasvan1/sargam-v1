import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNotebookSettings } from '@/context/NotebookSettingsContext';
import { useIsMobile } from '@/hooks/use-mobile';

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
  zoomLevel: number;
}

const SWARA_NAMES: Record<string, string> = {
  S: 'Sa',
  R: 'Re',
  G: 'Ga',
  M: 'Ma',
  P: 'Pa',
  D: 'Dha',
  N: 'Ni',
};
const SWARA_NAMES_HI: Record<string, string> = {
  S: 'सा',
  R: 'रे',
  G: 'ग',
  M: 'म',
  P: 'प',
  D: 'ध',
  N: 'नी',
};

export function VisualizerNote({
  event,
  lineStartTime,
  pixelsPerSecond,
  onSeek,
  zoomLevel,
}: VisualizerNoteProps) {
  const { language } = useNotebookSettings();
  const isMobile = useIsMobile();

  // Check for meend ornament
  const meendOrnament = event.ornaments?.find(
    (o: any) => o.name === 'meend' || o.name === 'slide'
  );
  const hasMeend = meendOrnament && meendOrnament.params.length > 0;

  // Parse target swara from meend
  let targetSwara = null;
  let targetOctave = 0;
  let targetVariant = '';

  if (hasMeend) {
    const targetStr = meendOrnament.params[0]?.trim();
    if (targetStr) {
      const upper = targetStr.toUpperCase();
      if (upper.startsWith('SA')) targetSwara = 'S';
      else if (upper.startsWith('RI')) targetSwara = 'R';
      else if (upper.startsWith('GA')) targetSwara = 'G';
      else if (upper.startsWith('MA')) targetSwara = 'M';
      else if (upper.startsWith('PA')) targetSwara = 'P';
      else if (upper.startsWith('DHA')) targetSwara = 'D';
      else if (upper.startsWith('NI')) targetSwara = 'N';
      else if (targetStr[0]) {
        const firstChar = targetStr[0];
        if (['S', 'R', 'G', 'M', 'P', 'D', 'N', 'm'].includes(firstChar)) {
          targetSwara = firstChar === 'm' ? 'M' : firstChar;
        } else {
          const upperFirst = firstChar.toUpperCase();
          if (['S', 'R', 'G', 'M', 'P', 'D', 'N'].includes(upperFirst)) {
            targetSwara = upperFirst;
          }
        }
      }

      // Parse target variant
      if (targetStr.includes('k') || targetStr.includes('b'))
        targetVariant = 'k';
      else if (targetStr.includes('t') || targetStr.includes('#'))
        targetVariant = 't';

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
    return octave > 0 ? "'".repeat(octave) : ','.repeat(Math.abs(octave));
  };

  const getNoteLabel = (
    swara: string | undefined,
    variant: string | undefined,
    octave: number | undefined
  ) => {
    if (!swara) return '';
    let name =
      (language === 'hi' ? SWARA_NAMES_HI[swara] : SWARA_NAMES[swara]) || swara;

    let label = name;
    if (variant === 'k' || variant === 'b') label += ' (Komal)';
    else if (variant === 't' || variant === '#' || variant === 'Mt')
      label += ' (Tivra)';

    if (octave && octave !== 0) {
      label += ` ${octave > 0 ? '+' : ''}${octave}`;
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

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isLongPress.current) {
        isLongPress.current = false;
        return;
      }
      // Seeking must use audioStartTime, not visual startTime
      onSeek?.(event.audioStartTime + 0.001);
    },
    [event.audioStartTime, onSeek]
  );

  if (hasMeend && targetSwara) {
    const displaySwaraStart =
      (language === 'hi' ? SWARA_NAMES_HI[event.swara || ''] : event.swara) ||
      event.swara;
    const displaySwaraEnd =
      (language === 'hi' ? SWARA_NAMES_HI[targetSwara || ''] : targetSwara) ||
      targetSwara;

    const isKomalStart = event.variant === 'k' || event.variant === 'b';
    const isTivraStart =
      event.variant === 't' || event.variant === '#' || event.variant === 'Mt';
    const isKomalEnd = targetVariant === 'k' || targetVariant === 'b';
    const isTivraEnd =
      targetVariant === 't' || targetVariant === '#' || targetVariant === 'Mt';

    return (
      <Tooltip delayDuration={0} open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <div
            className="absolute top-[5%] bottom-[5%] rounded-md overflow-hidden bg-primary/20 border-[1.5px] border-primary/60 cursor-pointer pointer-events-auto hover:border-primary/80 select-none"
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
              <span
                className={cn(
                  'text-xs font-black text-primary drop-shadow-sm',
                  isKomalStart && 'underline decoration-2 underline-offset-2',
                  isTivraStart && 'overline decoration-2 overline-offset-2'
                )}
              >
                {displaySwaraStart}
                {/* {(!isHindi && event.variant) || ""} */}
              </span>
              {event.octave !== 0 && (
                <span className="text-[7px] ">
                  {getOctaveMarks(event.octave!)}
                </span>
              )}
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
              <svg
                width="32"
                height="12"
                viewBox="0 0 32 12"
                fill="none"
                className="text-primary/70"
              >
                <path
                  d="M2 6 Q16 2, 28 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M28 6 L24 3.5 L24 8.5 Z"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </div>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <span
                className={cn(
                  'text-xs font-black text-primary drop-shadow-sm',
                  isKomalEnd && 'underline decoration-2 underline-offset-2',
                  isTivraEnd && 'overline decoration-2 overline-offset-2'
                )}
              >
                {displaySwaraEnd}
                {/* {!isHindi && targetVariant} */}
              </span>
              {targetOctave !== 0 && (
                <span className="text-[7px] ">
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
          {' → '}
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
            className="absolute top-[5%] bottom-[5%] rounded-full cursor-pointer pointer-events-auto select-none bg-amber-400"
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            style={{
              left: `${leftPosition}px`,
              width: `4px`,
              // width: `${width}px`,
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="top">Chikari</TooltipContent>
      </Tooltip>
    );
  }

  if (event.type === 'skip') {
    return (
      <div
        className="absolute top-[10%] bottom-[10%] border-2 border-dashed border-muted-foreground/20 rounded bg-muted/5 flex items-center justify-center cursor-pointer pointer-events-auto select-none group"
        onClick={handleClick}
        style={{
          left: `${leftPosition}px`,
          width: `${width}px`,
        }}
      >
        <span className="text-xs text-muted-foreground/40 font-mono group-hover:text-primary transition-colors">
          /
        </span>
      </div>
    );
  }

  const displaySwara =
    (language === 'hi' ? SWARA_NAMES_HI[event.swara || ''] : event.swara) ||
    event.swara;
  const isKomal = event.variant === 'k' || event.variant === 'b';
  const isTivra =
    event.variant === 't' || event.variant === '#' || event.variant === 'Mt';
  const isHindi = language === 'hi';
  const showUnderline = isKomal;
  const showOverline = isTivra;
  return (
    <Tooltip delayDuration={0} open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'absolute top-[5%] bottom-[5%] rounded-md flex items-center justify-center',
            'font-black cursor-pointer pointer-events-auto hover:border-primary/70 select-none',
            event.swara
              ? 'bg-linear-to-br from-primary/40 to-primary/10 text-primary border border-primary/40'
              : 'bg-muted/10 border border-transparent opacity-40 hover:opacity-60'
          )}
          onClick={handleClick}
          onDoubleClick={() => {
            setOpen(true);
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          style={{
            left: `${leftPosition}px`,
            width: `${width}px`,
          }}
        >
          <span className="hidden text-xxs"></span>
          <span
            className={cn(
              'drop-shadow-sm flex items-center',
              isMobile
                ? zoomLevel <= 1
                  ? 'text-xxs'
                  : zoomLevel <= 1.25
                    ? 'text-xs'
                    : zoomLevel <= 1.5
                      ? (event.duration ?? 1) < 0.5
                        ? 'text-xxs'
                        : 'text-sm'
                      : zoomLevel <= 1.75
                        ? (event.duration ?? 1) < 0.5
                          ? 'text-xxs'
                          : 'text-sm'
                        : (event.duration ?? 1) < 0.5
                          ? 'text-sm'
                          : 'text-base'
                : zoomLevel <= 1
                  ? (event.duration ?? 1) < 0.5
                    ? 'text-xxxs'
                    : 'text-xs'
                  : zoomLevel <= 1.25
                    ? (event.duration ?? 1) < 0.5
                      ? 'text-xxs'
                      : 'text-xs'
                    : zoomLevel <= 1.5
                      ? (event.duration ?? 1) < 0.5
                        ? 'text-xs'
                        : 'text-base'
                      : (event.duration ?? 1) < 0.5
                        ? 'text-sm'
                        : 'text-base',
              showUnderline && 'underline decoration-2 underline-offset-2',
              showOverline && 'overline decoration-2 overline-offset-2'
            )}
          >
            {displaySwara}
            {/* {(!isHindi && event.variant) || ""} */}
            {event.octave !== 0 && (
              <span className="">{getOctaveMarks(event.octave!)}</span>
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
