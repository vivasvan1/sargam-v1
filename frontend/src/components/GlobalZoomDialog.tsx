import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useNotebookSettings } from '../context/NotebookSettingsContext';

interface GlobalZoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_ZOOMS = [50, 75, 100, 125, 150, 200, 250, 300];

export function GlobalZoomDialog({ open, onOpenChange }: GlobalZoomDialogProps) {
  const { globalZoomLevel, setGlobalZoomLevel } = useNotebookSettings();
  const [currentZoomPercent, setCurrentZoomPercent] = useState(
    Math.round(globalZoomLevel * 100)
  );

  useEffect(() => {
    if (open) {
      setCurrentZoomPercent(Math.round(globalZoomLevel * 100));
    }
  }, [open, globalZoomLevel]);

  const handleApply = () => {
    setGlobalZoomLevel(currentZoomPercent / 100);
    onOpenChange(false);
  };

  const handleReset = () => {
    setCurrentZoomPercent(100);
    setGlobalZoomLevel(1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Global Zoom Level</DialogTitle>
          <DialogDescription>
            Set the visualizer zoom level for all music cells in this notebook.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Main Controls: - / Input / + */}
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => setCurrentZoomPercent((z) => Math.max(50, z - 10))}
              disabled={currentZoomPercent <= 50}
              title="Decrease zoom"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex items-center justify-center gap-1 border border-border/70 rounded-xl px-4 py-1.5 bg-muted/20">
              <Input
                type="number"
                min={50}
                max={300}
                step={5}
                value={currentZoomPercent}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    setCurrentZoomPercent(Math.min(300, Math.max(50, val)));
                  }
                }}
                className="h-8 w-16 text-center text-lg font-mono font-bold p-0 border-none bg-transparent focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm font-semibold text-muted-foreground">%</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => setCurrentZoomPercent((z) => Math.min(300, z + 10))}
              disabled={currentZoomPercent >= 300}
              title="Increase zoom"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Slider */}
          <div className="space-y-2 px-1">
            <Slider
              value={[currentZoomPercent]}
              min={50}
              max={300}
              step={5}
              onValueChange={(vals) => setCurrentZoomPercent(vals[0])}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
              <span>50%</span>
              <span>100%</span>
              <span>200%</span>
              <span>300%</span>
            </div>
          </div>

          {/* Preset Chips */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground font-medium">Presets</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ZOOMS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="xs"
                  variant={currentZoomPercent === preset ? 'default' : 'outline'}
                  onClick={() => setCurrentZoomPercent(preset)}
                  className="text-xs font-mono rounded-lg h-7 px-2.5"
                >
                  {preset}%
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to 100%
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
