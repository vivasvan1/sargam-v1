import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface VisualizerBarProps {
  event: {
    startTime: number;
    double?: boolean;
    comment?: string;
    [key: string]: any;
  };
  lineStartTime: number;
  pixelsPerSecond: number;
  onSeek?: (time: number) => void;
}

export function VisualizerBar({
  event,
  lineStartTime,
  pixelsPerSecond,
  onSeek,
}: VisualizerBarProps) {
  const hasComment = Boolean(event.comment);

  const barElement = (
    <div
      className="absolute top-0 bottom-0 cursor-pointer pointer-events-auto group/bar -translate-x-1/2 w-4 z-10"
      onClick={(e) => {
        e.stopPropagation();
        onSeek?.(event.audioStartTime + 0.001);
      }}
      style={{
        left: `${(event.startTime - lineStartTime) * pixelsPerSecond}px`,
        height: '100%',
      }}
    >
      {/* Visual Bar Line(s) */}
      {event.double ? (
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-[3px]">
          <div
            className={cn(
              'w-[2px] h-full transition-colors',
              hasComment
                ? 'bg-primary/90 group-hover/bar:bg-primary'
                : 'bg-primary/70 group-hover/bar:bg-primary'
            )}
          />
          <div
            className={cn(
              'w-[1.5px] h-full transition-colors',
              hasComment
                ? 'bg-primary/60 group-hover/bar:bg-primary'
                : 'bg-primary/40 group-hover/bar:bg-primary/70'
            )}
          />
        </div>
      ) : (
        <div
          className={cn(
            'absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] transition-colors',
            hasComment
              ? 'bg-primary/80 group-hover/bar:bg-primary'
              : 'bg-primary/50 group-hover/bar:bg-primary'
          )}
        />
      )}

      {/* Comment Marker Dot */}
      {hasComment && (
        <span
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary ring-2 ring-background shadow-xs group-hover/bar:scale-125 transition-transform"
          aria-hidden="true"
        />
      )}
    </div>
  );

  if (!hasComment) {
    return barElement;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{barElement}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="text-xs font-medium">
        {event.comment}
      </TooltipContent>
    </Tooltip>
  );
}
