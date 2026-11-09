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
      className={cn(
        'absolute top-0 bottom-0 cursor-pointer pointer-events-auto transition-colors group/bar',
        '-ml-1.5 pl-1.5 w-3',
        event.double
          ? 'border-l-[3px] border-primary/70 hover:border-primary'
          : hasComment
            ? 'border-l-2 border-primary/80 hover:border-primary'
            : 'border-l-2 border-primary/50 hover:border-primary'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSeek?.(event.audioStartTime + 0.001);
      }}
      style={{
        left: `${(event.startTime - lineStartTime) * pixelsPerSecond}px`,
        height: '100%',
      }}
    >
      {hasComment && (
        <span
          className="absolute -top-1 left-[-4px] w-2 h-2 rounded-full bg-primary ring-2 ring-background shadow-xs group-hover/bar:scale-125 transition-transform"
          aria-hidden="true"
        />
      )}
      {event.double && (
        <div className="absolute left-[3px] top-0 bottom-0 border-l mr-[2px] border-primary/30 ml-[2px]" />
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
