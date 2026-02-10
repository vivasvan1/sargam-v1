import { cn } from '@/lib/utils';

interface VisualizerBarProps {
  event: {
    startTime: number;
    double?: boolean;
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
  return (
    <div
      className={cn(
        'absolute top-0 bottom-0 cursor-pointer pointer-events-auto hover:border-primary transition-colors',
        event.double
          ? 'border-l-[3px] border-primary/70 shadow-[1px_0_0_0_rgba(var(--primary),0.3)]'
          : 'border-l-2 border-primary/50'
      )}
      onClick={() => onSeek?.(event.audioStartTime + 0.001)}
      style={{
        left: `${(event.startTime - lineStartTime) * pixelsPerSecond}px`,
        height: '100%',
      }}
    >
      {event.double && (
        <div className="absolute left-[3px] top-0 bottom-0 border-l mr-[2px] border-primary/30 ml-[2px]" />
      )}
    </div>
  );
}
