import { useState, useCallback } from 'react';
import * as Tone from 'tone';
import { HelpCircle, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VisualizerNote } from './VisualizerNote';

interface LegendItem {
  label: string;
  symbol: string;
  description: string;
  event: {
    swara: string;
    variant?: string;
    octave?: number;
    startTime: number;
    durationSeconds: number;
  };
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    label: 'Sa',
    symbol: 'S',
    description: 'The root note (Shadja). Everything is relative to this.',
    event: { swara: 'S', startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Lower Octave',
    symbol: 'S,',
    description:
      'A comma (or dot below) indicates the lower octave (Mandra Saptak).',
    event: { swara: 'S', octave: -1, startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Upper Octave',
    symbol: "S'",
    description:
      'An apostrophe (or dot above) indicates the upper octave (Taar Saptak).',
    event: { swara: 'S', octave: 1, startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Komal Ni',
    symbol: 'n (or Nk)',
    description: "Lowercase or 'k' indicates a Komal (flat) note.",
    event: { swara: 'N', variant: 'k', startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Shuddha Ni',
    symbol: 'N',
    description: 'Uppercase indicates a Shuddha (natural) note.',
    event: { swara: 'N', startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Shuddha Ma',
    symbol: 'M',
    description: 'The natural 4th (Shuddha Madhyam).',
    event: { swara: 'M', startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Tivra Ma',
    symbol: 'Mt',
    description: "'t' after Ma indicates Tivra (sharp) Madhyam.",
    event: { swara: 'M', variant: 't', startTime: 0, durationSeconds: 0.8 },
  },
  {
    label: 'Skip',
    symbol: '/',
    description:
      'Visually skips time in the grid, but plays instantly (teleport).',
    event: { type: 'skip', startTime: 0, durationSeconds: 0.8 } as any,
  },
];

export function NoteLegendModal() {
  const [open, setOpen] = useState(false);

  const playNote = useCallback(async (item: LegendItem) => {
    await Tone.start();
    const synth = new Tone.Synth().toDestination();

    // Simplified frequency calculation for the legend
    const SA_FREQ = 261.63; // Middle C
    const scales: Record<string, number> = {
      S: 0,
      R: 2,
      G: 4,
      M: 5,
      P: 7,
      D: 9,
      N: 11,
    };

    const { swara, variant, octave } = item.event;
    let semitones = scales[swara] || 0;
    if (variant === 'k') semitones -= 1;
    if (variant === 't') semitones += 1;
    semitones += (octave || 0) * 12;

    const freq = SA_FREQ * Math.pow(2, semitones / 12);

    synth.triggerAttackRelease(freq, '8n');
    setTimeout(() => synth.dispose(), 1000);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full">
          <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            How to Read Notation
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {LEGEND_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/10 transition-colors group"
            >
              <div className="relative w-16 h-12 shrink-0 bg-muted/10 rounded overflow-hidden flex items-center justify-center">
                <VisualizerNote
                  event={item.event}
                  lineStartTime={0}
                  pixelsPerSecond={60}
                  zoomLevel={1}
                />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    {item.label}
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                      {item.symbol}
                    </code>
                  </h4>
                  <Button
                    variant="outline"
                    size={'xs'}
                    className="rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      playNote(item);
                    }}
                  >
                    <Play className="w-3 h-3 fill-muted-foreground text-muted-foreground" />
                    Play
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground text-center italic">
            Tip: You can also tap and hold notes in the visualizer to see their
            full names.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
