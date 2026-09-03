import React, { memo, useCallback, useEffect, useRef } from 'react';
import { CornerDownLeftIcon, DeleteIcon, Keyboard, Minimize, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface SargamKeyboardKey {
  tooltip: string;
  label: string;
  value: string;
}

interface SargamKeyboardProps {
  visible: boolean;
  minimized: boolean;
  isMobile: boolean;
  hasUnsavedChanges: boolean;
  notationKeys: SargamKeyboardKey[];
  octaveKeys: SargamKeyboardKey[];
  durationKeys: SargamKeyboardKey[];
  specialKeys?: SargamKeyboardKey[];
  onInsert: (value: string) => void;
  onDelete: () => boolean | void;
  onSave: () => void;
  onMinimize: () => void;
  onShow: () => void;
  onShowNormalKeyboard: () => void;
}

function KeyboardKey({
  keyConfig,
  onInsert,
  className = '',
  isMobile = false,
}: {
  keyConfig: SargamKeyboardKey;
  onInsert: (value: string) => void;
  className?: string;
  isMobile?: boolean;
}) {
  const button = (
    <Button
      size="sm"
      variant="outline"
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onInsert(keyConfig.value)}
      className={`min-w-10 px-3 select-none touch-manipulation active:bg-accent ${className}`}
    >
      {keyConfig.label}
    </Button>
  );

  // On mobile touch devices, bypass Radix Tooltip completely to eliminate
  // floating-UI recalculations, touch delay, and DOM thrashing
  if (isMobile) {
    return button;
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="top">{keyConfig.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function BackspaceButton({
  onDelete,
  className = '',
}: {
  onDelete: () => boolean | void;
  className?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didDeleteOnPointerRef = useRef(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const stopDeleting = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleBlur = () => stopDeleting();
    window.addEventListener('blur', handleBlur);
    return () => {
      stopDeleting();
      window.removeEventListener('blur', handleBlur);
    };
  }, [stopDeleting]);

  const startDeleting = useCallback(() => {
    stopDeleting();
    didDeleteOnPointerRef.current = true;

    // Delete once immediately on press
    const hasMore = onDeleteRef.current();
    if (hasMore === false) {
      return;
    }

    let repeatCount = 0;

    const runInterval = (speed: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        repeatCount++;
        const canContinue = onDeleteRef.current();
        if (canContinue === false) {
          stopDeleting();
          return;
        }
        // Accelerate deletion speed as the key is held longer
        if (repeatCount === 10) {
          runInterval(40);
        } else if (repeatCount === 25) {
          runInterval(25);
        }
      }, speed);
    };

    timerRef.current = setTimeout(() => {
      runInterval(70);
    }, 400);
  }, [stopDeleting]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    startDeleting();

    const handleGlobalPointerUp = () => {
      stopDeleting();
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
  };

  const handleClick = () => {
    if (didDeleteOnPointerRef.current) {
      didDeleteOnPointerRef.current = false;
      return;
    }
    onDeleteRef.current();
  };

  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerUp={stopDeleting}
      onPointerCancel={stopDeleting}
      onPointerLeave={stopDeleting}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleClick}
      className={`min-w-24 select-none touch-manipulation ${className}`}
      aria-label="Delete"
    >
      <DeleteIcon className="w-4 h-4" />
    </Button>
  );
}

export const SargamKeyboard = memo(function SargamKeyboard({
  visible,
  minimized,
  isMobile,
  hasUnsavedChanges,
  notationKeys,
  octaveKeys,
  durationKeys,
  specialKeys,
  onInsert,
  onDelete,
  onSave,
  onMinimize,
  onShow,
  onShowNormalKeyboard,
}: SargamKeyboardProps) {
  if (!visible) return null;

  if (minimized) {
    return (
      <Button
        size="sm"
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onShow}
        className="fixed bottom-3 right-3 z-50 select-none touch-manipulation"
      >
        Show keyboard
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background p-2">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div className="flex w-full items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-2">
            {notationKeys.map((key) => (
              <KeyboardKey key={key.label} keyConfig={key} onInsert={onInsert} isMobile={isMobile} />
            ))}
            {specialKeys?.map((key) => (
              <KeyboardKey key={key.label} keyConfig={key} onInsert={onInsert} isMobile={isMobile} />
            ))}
          </div>
          <div className="flex flex-0 flex-wrap justify-end flex-reverse gap-2">

            <Button
              size="sm"
              variant="outline"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onMinimize}
              className="select-none touch-manipulation"
            >
              <Minimize className="w-4 h-4" />
            </Button>
            <BackspaceButton onDelete={onDelete} />
          </div>
        </div>

        <div className="flex w-full items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-2">
            {octaveKeys.map((key) => (
              <KeyboardKey key={key.label} keyConfig={key} onInsert={onInsert} isMobile={isMobile} />
            ))}
            {durationKeys.map((key) => (
              <KeyboardKey key={key.label} keyConfig={key} onInsert={onInsert} isMobile={isMobile} />
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert('\n')}
            className="min-w-24 select-none touch-manipulation"
          >
            <CornerDownLeftIcon className="w-4 h-4" />
            Return
          </Button>
        </div>

        <div className="flex w-full items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(' ')}
            className="flex-1 min-w-40 select-none touch-manipulation"
          >
            Space
          </Button>
          <Button
            size="sm"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSave}
            disabled={!hasUnsavedChanges}
            className="min-w-10 select-none touch-manipulation"
          >
            <Save className="w-4 h-4" />
          </Button>
          {isMobile && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={onShowNormalKeyboard}
              className="select-none touch-manipulation"
            >
              <Keyboard className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
