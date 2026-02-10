import { memo } from 'react';
import { cn } from '@/lib/utils';
import { VisualizerBeatNumbers, VisualizerGrid } from './VisualizerGrid';
import { VisualizerNote } from './VisualizerNote';
import { VisualizerBar } from './VisualizerBar';
import { VisualizerPlayhead } from './VisualizerPlayhead';

interface VisualizerLineProps {
  line: {
    events: any[];
    duration: number;
    startTime: number;
  };
  previousLine?: {
    events: any[];
    duration: number;
    startTime: number;
  } | null;
  isActive: boolean;
  currentTime: number;
  beatDur: number;
  beatCount: number;
  beatWidth: number;
  pixelsPerSecond: number;
  onSeek?: (time: number) => void;
  playheadRef?: React.RefObject<HTMLDivElement | null>;
  zoomLevel: number;
}

export const VisualizerLine = memo(function VisualizerLine({
  line,
  previousLine,
  isActive,
  currentTime,
  beatDur,
  beatCount,
  beatWidth,
  pixelsPerSecond,
  onSeek,
  playheadRef,
  zoomLevel,
}: VisualizerLineProps) {
  const isCommentLine = line.events.some((e) => e.type === 'comment');
  const isPreviousCommentLine = previousLine?.events.some(
    (e) => e.type === 'comment'
  );
  if (isCommentLine) {
    const commentText = line.events
      .filter((e) => e.type === 'comment')
      .map((e) => (e as any).text)
      .join(' ')
      .replace(/^[#\/]+\s*/, '');

    return (
      <div className="flex flex-col">
        <div
          className={cn(
            'flex text-sm text-foreground/80 font-extrabold italic',
            isPreviousCommentLine ? 'pb-5' : 'py-5'
          )}
        >
          {commentText}
        </div>
      </div>
    );
  }

  const lineProgress = isActive ? currentTime - line.startTime : 0;
  const totalBeatsInLine = Math.ceil(line.duration / beatDur);
  const lineWidth = (beatCount || totalBeatsInLine || 4) * beatWidth;
  return (
    <>
      {isPreviousCommentLine && (
        <VisualizerBeatNumbers
          beatCount={beatCount}
          beatWidth={beatWidth}
          zoomLevel={zoomLevel}
        />
      )}
      <div
        className={cn('relative group transition-all duration-500')}
        style={{
          height: '4rem',
          width: `${lineWidth}px`,
        }}
      >
        <VisualizerGrid beatCount={beatCount} beatWidth={beatWidth} />

        <div className="absolute inset-0 z-10 pointer-events-none">
          {line.events.map((event, eIdx) => {
            if (event.type === 'comment') return null;

            if (event.type === 'bar') {
              return (
                <VisualizerBar
                  key={`bar-${eIdx}`}
                  event={event}
                  lineStartTime={line.startTime}
                  pixelsPerSecond={pixelsPerSecond}
                  onSeek={onSeek}
                />
              );
            }

            const duration = (event as any).duration;
            if (!('swara' in event) && !duration) return null;

            return (
              <VisualizerNote
                key={eIdx}
                event={event}
                lineStartTime={line.startTime}
                pixelsPerSecond={pixelsPerSecond}
                onSeek={onSeek}
                zoomLevel={zoomLevel}
              />
            );
          })}
        </div>

        {isActive && (
          <VisualizerPlayhead
            ref={playheadRef}
            lineProgress={lineProgress}
            pixelsPerSecond={pixelsPerSecond}
          />
        )}
      </div>
    </>
  );
});
