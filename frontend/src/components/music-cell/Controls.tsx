import React from 'react';
import { Play, Square, Settings2, Eye, EyeOff, Code2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface ControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  mixerOpen: boolean;
  onToggleMixer: () => void;
  mixerContent: React.ReactNode;
  showVisualizer?: boolean;
  onToggleVisualizer?: () => void;
  showCode?: boolean;
  onToggleCode?: () => void;
  title?: string;
  tala?: string;
}

export const Controls = React.memo(function Controls({
  isPlaying,
  onPlay,
  mixerOpen,
  onToggleMixer,
  mixerContent,
  showVisualizer,
  onToggleVisualizer,
  showCode,
  onToggleCode,
  title,
  tala,
}: ControlsProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 md:px-4 py-2 bg-muted/10 min-w-0 gap-2',
        (showVisualizer || showCode) && 'border-b border-border'
      )}
    >
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <Button
          onClick={onPlay}
          variant={'default'}
          size="sm"
          className={`rounded-full shrink-0`}
        >
          {isPlaying ? (
            <>
              <Square className="w-3 h-3 fill-current shrink-0" />{' '}
              <span className="hidden sm:inline">Stop</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current shrink-0" />{' '}
              <span className="hidden sm:inline">Listen</span>
            </>
          )}
        </Button>

        <div className="relative shrink-0">
          <Button
            onClick={onToggleMixer}
            variant="ghost"
            size="icon-sm"
            className={cn(
              'rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 touch-manipulation',
              mixerOpen && 'bg-muted text-primary'
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
              'rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 touch-manipulation',
              showVisualizer && 'bg-muted text-primary'
            )}
            title={showVisualizer ? 'Hide Visualizer' : 'Show Visualizer'}
            aria-label="Toggle visualizer"
          >
            {showVisualizer ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </Button>
        )}

        {onToggleCode && (
          <Button
            onClick={onToggleCode}
            variant="ghost"
            size="icon-sm"
            className={cn(
              'rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 touch-manipulation',
              showCode && 'bg-muted text-primary'
            )}
            title={showCode ? 'Hide Code' : 'Show Code'}
            aria-label="Toggle code"
          >
            <Code2 className={cn('w-4 h-4', !showCode && 'opacity-50')} />
          </Button>
        )}
      </div>

      {title && !showVisualizer && (
        <div className="flex items-center gap-2 min-w-0 ml-auto pl-2 truncate text-right">
          <span
            className="text-xs md:text-sm font-semibold text-foreground/90 truncate"
            title={title}
          >
            {title}
          </span>
          {tala && (
            <span
              className="text-[10px] md:text-[11px] text-muted-foreground font-medium uppercase tracking-wider hidden sm:inline shrink-0"
              title={tala}
            >
              • {tala}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
