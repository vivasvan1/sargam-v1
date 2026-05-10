import { CornerDownLeftIcon, DeleteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  onInsert: (value: string) => void;
  onDelete: () => void;
  onSave: () => void;
  onMinimize: () => void;
  onShow: () => void;
  onShowNormalKeyboard: () => void;
}

function KeyboardKey({
  keyConfig,
  onInsert,
  className = '',
}: {
  keyConfig: SargamKeyboardKey;
  onInsert: (value: string) => void;
  className?: string;
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(keyConfig.value)}
          className={`h-10 min-w-10 px-3 ${className}`}
        >
          {keyConfig.label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{keyConfig.tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function SargamKeyboard({
  visible,
  minimized,
  isMobile,
  hasUnsavedChanges,
  notationKeys,
  octaveKeys,
  durationKeys,
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
        className="fixed bottom-3 right-3 z-50"
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
              <KeyboardKey
                key={key.label}
                keyConfig={key}
                onInsert={onInsert}
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            className="h-10 min-w-24"
          >
            <DeleteIcon className="w-4 h-4" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onMinimize}
            className="h-10"
          >
            Minimise
          </Button>
        </div>

        <div className="flex w-full items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-2">
            {octaveKeys.map((key) => (
              <KeyboardKey
                key={key.label}
                keyConfig={key}
                onInsert={onInsert}
              />
            ))}
            {durationKeys.map((key) => (
              <KeyboardKey
                key={key.label}
                keyConfig={key}
                onInsert={onInsert}
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert('\n')}
            className="h-10 min-w-24"
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
            className="h-11 flex-1 min-w-40"
          >
            Space
          </Button>
          <Button
            size="sm"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSave}
            disabled={!hasUnsavedChanges}
            className="h-11 min-w-24"
          >
            Save
          </Button>
          {isMobile && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={onShowNormalKeyboard}
              className="h-11"
            >
              Normal keyboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
