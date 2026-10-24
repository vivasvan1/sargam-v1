import React, { useState, useRef, useEffect } from 'react';
import {
  Filter,
  Play,
  Pause,
  Check,
  Info,
  Sliders,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  applyBandpassFilter,
  applyHarmonicSeparation,
} from '@/utils/audio/audioSegmentation';

export type FilterMode = 'raw' | 'bandpass' | 'hpss';

interface Step2SegmentAudioProps {
  audioBuffer: AudioBuffer;
  saPitch: string;
  onFilterConfirmed: (filteredBuffer: AudioBuffer, filterUsed: FilterMode) => void;
  onSkip: () => void;
  onBack: () => void;
}

export const Step2SegmentAudio: React.FC<Step2SegmentAudioProps> = ({
  audioBuffer,
  saPitch,
  onFilterConfirmed,
  onSkip,
  onBack,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('raw');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessingFilter, setIsProcessingFilter] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const totalDuration = audioBuffer.duration;

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const togglePlay = async () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      await startPlayback();
    }
  };

  const startPlayback = async () => {
    stopPlayback();
    setIsProcessingFilter(true);

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      let bufferToPlay = audioBuffer;

      if (filterMode === 'bandpass') {
        bufferToPlay = await applyBandpassFilter(audioBuffer, 150, 3500);
      } else if (filterMode === 'hpss') {
        const rawSamples = audioBuffer.getChannelData(0);
        const harmonicSamples = applyHarmonicSeparation(rawSamples, audioBuffer.sampleRate);
        const hBuffer = audioCtx.createBuffer(1, harmonicSamples.length, audioBuffer.sampleRate);
        hBuffer.getChannelData(0).set(harmonicSamples);
        bufferToPlay = hBuffer;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = bufferToPlay;
      source.connect(audioCtx.destination);
      source.onended = () => setIsPlaying(false);
      source.start(0);
      sourceNodeRef.current = source;
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to preview filter:', err);
    } finally {
      setIsProcessingFilter(false);
    }
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleApplyFilter = async () => {
    stopPlayback();
    setIsProcessingFilter(true);

    try {
      if (filterMode === 'raw') {
        onFilterConfirmed(audioBuffer, 'raw');
        return;
      }

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let filteredBuffer = audioBuffer;

      if (filterMode === 'bandpass') {
        filteredBuffer = await applyBandpassFilter(audioBuffer, 150, 3500);
      } else if (filterMode === 'hpss') {
        const rawSamples = audioBuffer.getChannelData(0);
        const harmonicSamples = applyHarmonicSeparation(rawSamples, audioBuffer.sampleRate);
        const hBuffer = audioCtx.createBuffer(1, harmonicSamples.length, audioBuffer.sampleRate);
        hBuffer.getChannelData(0).set(harmonicSamples);
        filteredBuffer = hBuffer;
      }

      onFilterConfirmed(filteredBuffer, filterMode);
    } catch (err) {
      console.error('Error applying filter:', err);
      onFilterConfirmed(audioBuffer, 'raw');
    } finally {
      setIsProcessingFilter(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = (sec % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  return (
    <div className="space-y-5 w-full">
      {/* Notice Banner */}
      <div className="flex items-start gap-3 p-3.5 border border-blue-500/25 bg-blue-500/5 rounded-xl text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold text-foreground flex items-center gap-2">
            Step 2: Instrument Isolation Filter
            <Badge variant="secondary" className="text-[10px] font-bold uppercase">
              Optional
            </Badge>
          </div>
          <p>
            Optionally isolate your vocal or flute melody by applying filters to attenuate background noise or tabla accompaniment.
            You can also click <strong>Skip Filter</strong> to transcribe the audio directly.
          </p>
        </div>
      </div>

      {/* Audio Track Info Card */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">Loaded Audio Track</h4>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="outline" className="font-mono text-primary font-bold">
              Fixed Sa: {saPitch}
            </Badge>
            <Badge variant="secondary">
              Duration: {formatSeconds(totalDuration)} ({totalDuration.toFixed(1)}s)
            </Badge>
            <Badge variant="secondary">
              {audioBuffer.sampleRate} Hz ({audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'})
            </Badge>
          </div>
        </div>
      </div>

      {/* Filter Selection Card */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">Select Isolation Filter</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            type="button"
            variant={filterMode === 'raw' ? 'default' : 'outline'}
            className="flex flex-col items-start h-auto p-3.5 text-left transition-all"
            onClick={() => {
              stopPlayback();
              setFilterMode('raw');
            }}
          >
            <span className="font-semibold text-xs">Original (Raw)</span>
            <span className="text-[11px] text-muted-foreground font-normal mt-1">
              Bypass filtering; transcribe the audio directly as recorded.
            </span>
          </Button>

          <Button
            type="button"
            variant={filterMode === 'bandpass' ? 'default' : 'outline'}
            className="flex flex-col items-start h-auto p-3.5 text-left transition-all"
            onClick={() => {
              stopPlayback();
              setFilterMode('bandpass');
            }}
          >
            <span className="font-semibold text-xs">Vocal / Lead Pass</span>
            <span className="text-[11px] text-muted-foreground font-normal mt-1">
              Bandpass (150Hz – 3.5kHz) cuts sub-bass rumble and high hiss.
            </span>
          </Button>

          <Button
            type="button"
            variant={filterMode === 'hpss' ? 'default' : 'outline'}
            className="flex flex-col items-start h-auto p-3.5 text-left transition-all"
            onClick={() => {
              stopPlayback();
              setFilterMode('hpss');
            }}
          >
            <span className="font-semibold text-xs">Harmonic (HPSS)</span>
            <span className="text-[11px] text-muted-foreground font-normal mt-1">
              Harmonic separation suppresses percussive tabla strokes.
            </span>
          </Button>
        </div>

        {/* Listen Preview Button */}
        <div className="pt-2 flex items-center justify-between flex-wrap gap-2 border-t border-border/60">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={togglePlay}
            disabled={isProcessingFilter}
            className="text-xs font-medium h-8"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5 ml-0.5" />
            )}
            {isProcessingFilter
              ? 'Processing Filter...'
              : isPlaying
              ? 'Stop Preview'
              : 'Listen with Filter'}
          </Button>

          <span className="text-xs text-muted-foreground">
            Current mode: <strong className="text-foreground capitalize">{filterMode}</strong>
          </span>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onSkip}>
            Skip Filter
          </Button>
          <Button size="sm" onClick={handleApplyFilter} disabled={isProcessingFilter} className="font-semibold px-4">
            <Check className="w-4 h-4 mr-1.5" />
            Continue to Transcription
          </Button>
        </div>
      </div>
    </div>
  );
};
