import React, { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import {
  Upload,
  Mic,
  Square,
  Play,
  Pause,
  Volume2,
  Check,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  detectSaFromAudio,
  noteToFrequency,
  frequencyToNote,
  NOTE_NAMES,
  type DetectedSa,
} from '@/utils/audio/tonicDetector';

interface Step1FixSaProps {
  audioBuffer: AudioBuffer | null;
  onAudioLoaded: (buffer: AudioBuffer, fileOrBlobName: string) => void;
  confirmedSa: { pitch: string; frequency: number } | null;
  onConfirmSa: (sa: { pitch: string; frequency: number }) => void;
  onNext: () => void;
}

export const Step1FixSa: React.FC<Step1FixSaProps> = ({
  audioBuffer,
  onAudioLoaded,
  confirmedSa,
  onConfirmSa,
  onNext,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [detectedSa, setDetectedSa] = useState<DetectedSa | null>(null);
  const [selectedNote, setSelectedNote] = useState<string>('D');
  const [selectedOctave, setSelectedOctave] = useState<number>(4);
  const [centsOffset, setCentsOffset] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isPlayingDrone, setIsPlayingDrone] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Audio preview playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioStartTimeRef = useRef(0);
  const audioPauseOffsetRef = useRef(0);
  const audioAnimFrameRef = useRef<number | null>(null);

  // Tone.js Drone synth
  const droneSynthRef = useRef<Tone.Synth | null>(null);

  // Current calculated frequency
  const currentFrequency = Math.round(
    noteToFrequency(selectedNote, selectedOctave, centsOffset) * 100
  ) / 100;
  const currentPitchString = `${selectedNote}${selectedOctave}`;

  // Analyze audio whenever a new AudioBuffer is loaded
  useEffect(() => {
    if (!audioBuffer) return;

    setIsAnalyzing(true);
    const timer = setTimeout(() => {
      try {
        const channelData = audioBuffer.getChannelData(0);
        const sa = detectSaFromAudio(channelData, audioBuffer.sampleRate);
        setDetectedSa(sa);
        setSelectedNote(sa.note);
        setSelectedOctave(sa.octave);
        setCentsOffset(sa.centsOffset);
      } catch (err) {
        console.error('Failed to detect Sa:', err);
      } finally {
        setIsAnalyzing(false);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [audioBuffer]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
      stopDrone();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      stopAudioPlayback();
      onAudioLoaded(decoded, file.name);
    } catch (err) {
      console.error('Failed to decode audio file:', err);
      alert('Could not decode audio file. Please choose a valid MP3, WAV, or AAC file.');
    }
  };

  // Microphone recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        onAudioLoaded(decoded, 'Live Recording');
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic access error:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
  };

  // Play / Pause uploaded audio
  const togglePlayAudio = () => {
    if (!audioBuffer) return;

    if (isPlayingAudio) {
      stopAudioPlayback();
    } else {
      startAudioPlayback(audioPauseOffsetRef.current);
    }
  };

  const startAudioPlayback = (startOffset = 0) => {
    if (!audioBuffer) return;
    stopAudioPlayback();

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    source.onended = () => {
      setIsPlayingAudio(false);
      audioPauseOffsetRef.current = 0;
      setAudioCurrentTime(0);
    };

    const offset = Math.min(startOffset, audioBuffer.duration);
    source.start(0, offset);
    audioSourceNodeRef.current = source;
    audioStartTimeRef.current = ctx.currentTime - offset;
    setIsPlayingAudio(true);

    const updateTime = () => {
      if (!ctx || ctx.state === 'closed') return;
      const current = ctx.currentTime - audioStartTimeRef.current;
      if (current <= audioBuffer.duration) {
        setAudioCurrentTime(current);
        audioPauseOffsetRef.current = current;
        audioAnimFrameRef.current = requestAnimationFrame(updateTime);
      }
    };
    audioAnimFrameRef.current = requestAnimationFrame(updateTime);
  };

  const stopAudioPlayback = () => {
    if (audioSourceNodeRef.current) {
      try {
        audioSourceNodeRef.current.stop();
        audioSourceNodeRef.current.disconnect();
      } catch (e) {}
      audioSourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (audioAnimFrameRef.current) {
      cancelAnimationFrame(audioAnimFrameRef.current);
      audioAnimFrameRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  // Reference Sa Drone Synth (using Tone.js)
  const togglePlayDrone = async () => {
    if (isPlayingDrone) {
      stopDrone();
    } else {
      await Tone.start();
      if (!droneSynthRef.current) {
        droneSynthRef.current = new Tone.Synth({
          oscillator: { type: 'triangle8' },
          envelope: { attack: 0.1, decay: 0.2, sustain: 1.0, release: 0.5 },
        }).toDestination();
        droneSynthRef.current.volume.value = -12;
      }
      droneSynthRef.current.triggerAttack(currentFrequency);
      setIsPlayingDrone(true);
    }
  };

  const stopDrone = () => {
    if (droneSynthRef.current) {
      try {
        droneSynthRef.current.triggerRelease();
      } catch (e) {}
    }
    setIsPlayingDrone(false);
  };

  useEffect(() => {
    if (isPlayingDrone && droneSynthRef.current) {
      droneSynthRef.current.setNote(currentFrequency);
    }
  }, [currentFrequency, isPlayingDrone]);

  const handleConfirm = () => {
    stopAudioPlayback();
    stopDrone();
    onConfirmSa({
      pitch: currentPitchString,
      frequency: currentFrequency,
    });
    onNext();
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5 w-full">
      {/* 1. Audio Loading Section */}
      {!audioBuffer ? (
        <div className="border-2 border-dashed border-border rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 bg-muted/20 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Upload className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h4 className="font-semibold text-base">Select or Record Audio</h4>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Upload an audio file (.mp3, .wav, .m4a) or record using your microphone
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button variant="default" size="sm" asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  Choose Audio File
                </span>
              </Button>
            </label>

            <span className="text-xs text-muted-foreground">or</span>

            {!isRecording ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startRecording}
                className="text-red-500 hover:text-red-600"
              >
                <Mic className="w-4 h-4 mr-2" />
                Record from Mic
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={stopRecording}
                className="animate-pulse"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Recording ({formatTime(recordingSeconds)})
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Audio Player Card */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-full w-9 h-9 shrink-0"
                  onClick={togglePlayAudio}
                >
                  {isPlayingAudio ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </Button>
                <div>
                  <div className="text-sm font-medium">Uploaded Audio</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(audioCurrentTime)} / {formatTime(audioBuffer.duration)}
                  </div>
                </div>
              </div>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
                  <span>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Replace Audio
                  </span>
                </Button>
              </label>
            </div>

            {/* Playhead Scrubber */}
            <Slider
              value={[audioCurrentTime]}
              min={0}
              max={audioBuffer.duration || 1}
              step={0.1}
              onValueChange={([val]) => {
                setAudioCurrentTime(val);
                audioPauseOffsetRef.current = val;
                if (isPlayingAudio) startAudioPlayback(val);
              }}
              className="py-1 cursor-pointer"
            />
          </div>

          {/* Sa Pitch Detection Banner */}
          {isAnalyzing ? (
            <div className="flex items-center justify-center p-4 border rounded-xl gap-2 text-xs sm:text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              Analyzing audio harmonics and detecting tonic (Sa)...
            </div>
          ) : detectedSa ? (
            <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-semibold text-xs sm:text-sm">Detected Sa:</span>
                  <Badge variant="default" className="text-xs font-bold px-2 py-0.5">
                    {detectedSa.pitch} ({detectedSa.frequency} Hz)
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  Confidence: {Math.round(detectedSa.confidence * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                In Indian Classical Music, all notes are relative to <strong>Sa</strong>.
                Play the reference drone below while listening to the audio to check unison.
              </p>
            </div>
          ) : null}

          {/* Interactive Sa Tuner Card using shadcn components */}
          <div className="border border-border rounded-xl p-4 sm:p-5 bg-card space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-sm">Fine-Tune & Fix Sa</h4>
                <p className="text-xs text-muted-foreground">
                  Set note and octave, then verify with the reference drone
                </p>
              </div>

              <Button
                variant={isPlayingDrone ? 'destructive' : 'secondary'}
                size="sm"
                onClick={togglePlayDrone}
                className="font-medium text-xs shrink-0"
              >
                <Volume2 className="w-4 h-4 mr-1.5" />
                {isPlayingDrone ? 'Stop Drone' : 'Play Reference Drone'}
              </Button>
            </div>

            {/* Note & Octave Selectors (using shadcn Select to prevent overflow) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Root Swara (Note)</label>
                <Select value={selectedNote} onValueChange={setSelectedNote}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Select Note" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_NAMES.map((note) => (
                      <SelectItem key={note} value={note}>
                        {note} {note === 'D' ? '(Standard Sitar / Saptak)' : note === 'C#' ? '(Standard Female)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Octave Register</label>
                <Select
                  value={String(selectedOctave)}
                  onValueChange={(val) => setSelectedOctave(Number(val))}
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Select Octave" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Octave 3 (Male / Kharaj / Sitar lower)</SelectItem>
                    <SelectItem value="4">Octave 4 (Mid / Sitar Baaj / Female standard)</SelectItem>
                    <SelectItem value="5">Octave 5 (Taar / Higher register)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Note Pills (Responsive flex-wrap) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Quick Pick</span>
              <div className="flex flex-wrap gap-1.5">
                {NOTE_NAMES.map((note) => (
                  <Button
                    key={note}
                    type="button"
                    variant={selectedNote === note ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2.5 text-xs font-bold"
                    onClick={() => setSelectedNote(note)}
                  >
                    {note}
                  </Button>
                ))}
              </div>
            </div>

            {/* Cents Fine Tuning */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Fine Microtonal Offset</span>
                <span className="font-mono text-xs">{centsOffset > 0 ? `+${centsOffset}` : centsOffset} cents</span>
              </div>
              <Slider
                value={[centsOffset]}
                min={-50}
                max={50}
                step={1}
                onValueChange={([val]) => setCentsOffset(val)}
                className="py-1"
              />
            </div>

            {/* Summary & Confirm Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-border">
              <div className="text-xs">
                Selected Sa: <strong className="text-sm font-bold text-primary">{currentPitchString}</strong> ({currentFrequency} Hz)
              </div>

              <Button onClick={handleConfirm} size="sm" className="font-semibold w-full sm:w-auto">
                <Check className="w-4 h-4 mr-1.5" />
                Confirm Sa & Proceed
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
