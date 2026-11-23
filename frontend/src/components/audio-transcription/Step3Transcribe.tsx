import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Tone from 'tone';
import {
  Sparkles,
  Play,
  Pause,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  FileCode,
  Volume2,
  Search,
  Replace,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  transcribeAudioToSargam,
  TALA_PRESETS,
  type TranscriptionResult,
  type TranscribedNote,
} from '@/utils/audio/sargamTranscriber';
import { RAGA_PRESETS } from '@/utils/audio/raga/ragaDefinitions';
import { PitchContourVisualizer } from './PitchContourVisualizer';
import { NoteInspector } from './NoteInspector';
import { recalculateTranscriptionFromEvents } from '@/utils/audio/noteSynchronizer';
import type { TranscribedNoteEvent } from '@/utils/audio/types';

interface Step3TranscribeProps {
  audioBuffer: AudioBuffer;
  saPitch: string;
  saFrequency: number;
  onInsertCell: (sargamCode: string) => void;
  onBack: () => void;
}

export const Step3Transcribe: React.FC<Step3TranscribeProps> = ({
  audioBuffer,
  saPitch,
  saFrequency,
  onInsertCell,
  onBack,
}) => {
  const [bpm, setBpm] = useState<number>(50); // Default 50 BPM for Indian classical compositions
  const [talaId, setTalaId] = useState<string>('tintal');
  const [pickupBeat, setPickupBeat] = useState<number>(12); // Default Beat 12 for Tintal
  const [gridResolution, setGridResolution] = useState<0.5 | 0.25>(0.5);
  const [algorithm, setAlgorithm] = useState<'pyin' | 'yin'>('pyin');
  const [ragaId, setRagaId] = useState<string>('none');
  const [enableRagaCorrection, setEnableRagaCorrection] = useState<boolean>(true);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [sargamCode, setSargamCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Playback Cursor & Position Tracking
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const playStartTimeRef = useRef<number>(0);

  // Selected Note for Interactive Editing
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const sliceSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const selectedNote = useMemo(() => {
    if (!result || !selectedNoteId) return null;
    return result.events.find((n) => n.id === selectedNoteId) || null;
  }, [result, selectedNoteId]);

  // Search & Replace state
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [isCaseSensitive, setIsCaseSensitive] = useState(true);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(-1);

  // Textarea reference for selection highlighting
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Dual Audio Playback
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
  const [isPlayingSynth, setIsPlayingSynth] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const originalSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Tone.js PolySynth for vocal/flute sargam playback
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const scheduledEventsRef = useRef<number[]>([]);

  // Run initial transcription once on mount
  useEffect(() => {
    runTranscription();
  }, []);

  // Clean up playback on unmount
  useEffect(() => {
    return () => {
      stopOriginalAudio();
      stopSynthPlayback();
    };
  }, []);

  // Track real-time playback position across original audio or synthesized playback
  useEffect(() => {
    let animId: number;
    if (isPlayingOriginal && audioCtxRef.current) {
      const update = () => {
        if (audioCtxRef.current) {
          const elapsed = audioCtxRef.current.currentTime - playStartTimeRef.current;
          setPlaybackTime(elapsed);
          animId = requestAnimationFrame(update);
        }
      };
      animId = requestAnimationFrame(update);
    } else if (isPlayingSynth) {
      const update = () => {
        setPlaybackTime(Tone.getTransport().seconds);
        animId = requestAnimationFrame(update);
      };
      animId = requestAnimationFrame(update);
    } else {
      setPlaybackTime(0);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlayingOriginal, isPlayingSynth]);

  const runTranscription = () => {
    setIsTranscribing(true);
    stopOriginalAudio();
    stopSynthPlayback();

    setTimeout(() => {
      try {
        const channelData = audioBuffer.getChannelData(0);
        const res = transcribeAudioToSargam(
          channelData,
          audioBuffer.sampleRate,
          saPitch,
          saFrequency,
          {
            bpm,
            talaId,
            pickupBeat,
            gridResolution,
            algorithm,
            ragaId,
            enableRagaCorrection,
          }
        );
        setResult(res);
        setSargamCode(res.sargamCode);
      } catch (err) {
        console.error('Transcription error:', err);
        toast.error('Failed to transcribe audio.');
      } finally {
        setIsTranscribing(false);
      }
    }, 50);
  };

  // Play Original Audio
  const togglePlayOriginal = () => {
    if (isPlayingOriginal) {
      stopOriginalAudio();
    } else {
      stopSynthPlayback();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      playStartTimeRef.current = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsPlayingOriginal(false);
        setPlaybackTime(0);
      };
      source.start(0);
      originalSourceRef.current = source;
      setIsPlayingOriginal(true);
    }
  };

  const handleSeek = (timeSec: number) => {
    setPlaybackTime(timeSec);
    if (isPlayingOriginal) {
      stopOriginalAudio();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      playStartTimeRef.current = ctx.currentTime - timeSec;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsPlayingOriginal(false);
        setPlaybackTime(0);
      };
      source.start(0, Math.min(audioBuffer.duration, timeSec));
      originalSourceRef.current = source;
      setIsPlayingOriginal(true);
    }
  };

  const stopOriginalAudio = () => {
    if (sliceSourceRef.current) {
      try {
        sliceSourceRef.current.stop();
        sliceSourceRef.current.disconnect();
      } catch (e) {}
      sliceSourceRef.current = null;
    }
    if (originalSourceRef.current) {
      try {
        originalSourceRef.current.stop();
        originalSourceRef.current.disconnect();
      } catch (e) {}
      originalSourceRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
    setIsPlayingOriginal(false);
  };

  // Interactive Auditioning of an isolated note or time region
  const handleAuditionSlice = (startSec: number, endSec: number) => {
    stopOriginalAudio();
    stopSynthPlayback();

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    const dur = Math.max(0.05, endSec - startSec);
    source.start(0, startSec, dur);
    sliceSourceRef.current = source;
    source.onended = () => {
      sliceSourceRef.current = null;
    };
  };

  const handleAuditionSynth = (note: TranscribedNoteEvent) => {
    Tone.start();
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.2 },
      }).toDestination();
      synthRef.current.volume.value = -6;
    }

    const swaraSemitones: Record<string, number> = {
      S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, Mt: 6, P: 7, d: 8, D: 9, n: 10, N: 11,
    };
    const semitones = (swaraSemitones[note.swara] || 0) + note.octave * 12;
    const freq = saFrequency * Math.pow(2, semitones / 12);
    const now = Tone.now();

    if (note.ornament?.type === 'meend' && note.ornament.targetSwara) {
      const targetSemitones =
        (swaraSemitones[note.ornament.targetSwara] || 0) + note.octave * 12;
      const targetFreq = saFrequency * Math.pow(2, targetSemitones / 12);
      synthRef.current.set({ portamento: note.durationSeconds * 0.75 });
      synthRef.current.triggerAttackRelease(freq, note.durationSeconds, now);
      setTimeout(() => {
        try {
          synthRef.current?.triggerAttackRelease(
            targetFreq,
            note.durationSeconds * 0.4,
            now + note.durationSeconds * 0.5
          );
        } catch (e) {}
      }, 10);
    } else {
      synthRef.current.set({ portamento: 0 });
      synthRef.current.triggerAttackRelease(freq, note.durationSeconds, now);
    }
  };

  // Two-way synchronization when note events are edited
  const handleNotesChange = (updatedEvents: TranscribedNoteEvent[]) => {
    if (!result) return;
    const newRes = recalculateTranscriptionFromEvents(
      updatedEvents,
      result.contour,
      saPitch,
      saFrequency,
      {
        bpm,
        talaId,
        pickupBeat,
        gridResolution,
        ragaId,
        algorithm,
      }
    );
    setResult(newRes);
    setSargamCode(newRes.sargamCode);
  };

  const handleUpdateNote = (updated: TranscribedNoteEvent) => {
    if (!result) return;
    const updatedEvents = result.events.map((n) => (n.id === updated.id ? updated : n));
    handleNotesChange(updatedEvents);
  };

  const handleDeleteNote = (noteId: string) => {
    if (!result) return;
    const updatedEvents = result.events.filter((n) => n.id !== noteId);
    setSelectedNoteId(null);
    handleNotesChange(updatedEvents);
    toast.success('Note removed');
  };

  const handleSplitNote = (noteId: string) => {
    if (!result) return;
    const target = result.events.find((n) => n.id === noteId);
    if (!target) return;

    const midTime = (target.startTime + target.endTime) / 2;
    const note1: TranscribedNoteEvent = {
      ...target,
      id: `note-${Date.now()}-1`,
      endTime: Number(midTime.toFixed(3)),
      durationSeconds: Number((midTime - target.startTime).toFixed(3)),
      manuallyEdited: true,
    };
    const note2: TranscribedNoteEvent = {
      ...target,
      id: `note-${Date.now()}-2`,
      startTime: Number(midTime.toFixed(3)),
      durationSeconds: Number((target.endTime - midTime).toFixed(3)),
      manuallyEdited: true,
    };

    const idx = result.events.findIndex((n) => n.id === noteId);
    const updatedEvents = [
      ...result.events.slice(0, idx),
      note1,
      note2,
      ...result.events.slice(idx + 1),
    ];

    setSelectedNoteId(note1.id);
    handleNotesChange(updatedEvents);
    toast.success('Note split in half');
  };

  // Play Synthesized Sargam via Tone.js (Vocal / Flute sustained synth)
  const togglePlaySynth = async () => {
    if (isPlayingSynth) {
      stopSynthPlayback();
    } else {
      if (!result || result.notes.length === 0) return;
      stopOriginalAudio();

      await Tone.start();
      Tone.getTransport().stop();
      Tone.getTransport().cancel();

      if (!synthRef.current) {
        synthRef.current = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.2 },
        }).toDestination();
        synthRef.current.volume.value = -6;
      }

      Tone.getTransport().bpm.value = bpm;
      const beatSec = 60 / bpm;

      const swaraSemitones: Record<string, number> = {
        S: 0,
        r: 1,
        R: 2,
        g: 3,
        G: 4,
        m: 5,
        Mt: 6,
        P: 7,
        d: 8,
        D: 9,
        n: 10,
        N: 11,
      };

      let currentBeatOffset = 0;
      const eventIds: number[] = [];

      for (const note of result.notes) {
        if (note.type === 'skip') {
          continue;
        }

        if (note.type === 'note' && note.swara && note.swara !== '_') {
          const semitones =
            (swaraSemitones[note.swara] || 0) + (note.octave || 0) * 12;
          const freq = saFrequency * Math.pow(2, semitones / 12);
          const durSec = note.durationBeats * beatSec;

          // Check if token has +meend(Target) for portamento slide
          const meendMatch = note.token.match(/\+meend\(([^)]+)\)/);
          const targetSwara = meendMatch ? meendMatch[1] : null;

          if (targetSwara && swaraSemitones[targetSwara] !== undefined) {
            const targetSemitones =
              (swaraSemitones[targetSwara] || 0) + (note.octave || 0) * 12;
            const targetFreq = saFrequency * Math.pow(2, targetSemitones / 12);

            const evId = Tone.getTransport().schedule((time) => {
              const synth = synthRef.current;
              if (synth) {
                synth.set({ portamento: durSec * 0.75 });
                synth.triggerAttackRelease(freq, durSec * 0.95, time);
                // Trigger portamento slide toward target
                setTimeout(() => {
                  try {
                    synth.triggerAttackRelease(targetFreq, durSec * 0.3, time + durSec * 0.5);
                  } catch (e) {}
                }, 10);
              }
            }, currentBeatOffset * beatSec);
            eventIds.push(evId);
          } else {
            const evId = Tone.getTransport().schedule((time) => {
              if (synthRef.current) {
                synthRef.current.set({ portamento: 0 });
              }
              synthRef.current?.triggerAttackRelease(freq, durSec * 0.95, time);
            }, currentBeatOffset * beatSec);
            eventIds.push(evId);
          }
        }
        currentBeatOffset += note.durationBeats;
      }

      // Schedule stop
      const endEventId = Tone.getTransport().schedule(() => {
        setIsPlayingSynth(false);
        Tone.getTransport().stop();
      }, currentBeatOffset * beatSec + 0.1);
      eventIds.push(endEventId);

      scheduledEventsRef.current = eventIds;
      Tone.getTransport().start();
      setIsPlayingSynth(true);
    }
  };

  const stopSynthPlayback = () => {
    try {
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      scheduledEventsRef.current.forEach((id) => {
        try {
          Tone.getTransport().clear(id);
        } catch (e) {}
      });
      scheduledEventsRef.current = [];
    } catch (e) {}
    setIsPlayingSynth(false);
  };

  // --- Search & Replace Logic ---
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const matches = useMemo(() => {
    if (!searchQuery) return [];
    try {
      const flags = isCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(escapeRegExp(searchQuery), flags);
      const results: { start: number; end: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(sargamCode)) !== null) {
        results.push({ start: m.index, end: m.index + m[0].length });
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
      return results;
    } catch {
      return [];
    }
  }, [searchQuery, sargamCode, isCaseSensitive]);

  useEffect(() => {
    if (matches.length === 0) {
      setCurrentMatchIdx(-1);
    } else if (currentMatchIdx < 0 || currentMatchIdx >= matches.length) {
      setCurrentMatchIdx(0);
    }
  }, [matches.length]);

  const highlightMatch = useCallback((start: number, end: number) => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
    }
  }, []);

  const handleFindNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % matches.length;
    setCurrentMatchIdx(nextIdx);
    highlightMatch(matches[nextIdx].start, matches[nextIdx].end);
  };

  const handleFindPrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + matches.length) % matches.length;
    setCurrentMatchIdx(prevIdx);
    highlightMatch(matches[prevIdx].start, matches[prevIdx].end);
  };

  const handleReplaceCurrent = () => {
    if (matches.length === 0) return;
    const idx =
      currentMatchIdx >= 0 && currentMatchIdx < matches.length ? currentMatchIdx : 0;
    const match = matches[idx];

    const before = sargamCode.slice(0, match.start);
    const after = sargamCode.slice(match.end);
    const newCode = before + replaceQuery + after;
    setSargamCode(newCode);

    const nextSelectionStart = match.start;
    const nextSelectionEnd = nextSelectionStart + replaceQuery.length;
    setTimeout(() => {
      highlightMatch(nextSelectionStart, nextSelectionEnd);
    }, 10);
    toast.info('Replaced 1 match');
  };

  const handleReplaceAll = () => {
    if (!searchQuery || matches.length === 0) return;
    const flags = isCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(escapeRegExp(searchQuery), flags);
    const count = matches.length;
    const newCode = sargamCode.replace(regex, replaceQuery);
    setSargamCode(newCode);
    setCurrentMatchIdx(-1);
    toast.success(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sargamCode);
    setCopied(true);
    toast.success('Sargam notations copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    stopOriginalAudio();
    stopSynthPlayback();
    onInsertCell(sargamCode);
  };

  return (
    <div className="space-y-4 w-full">
      {/* Settings Card */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-3.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">Composition &amp; Tala Settings</h4>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-primary font-bold text-xs">
              Fixed Sa: {saPitch} ({saFrequency} Hz)
            </Badge>
            {ragaId !== 'none' && (
              <Badge variant="secondary" className="text-xs font-medium border border-primary/20">
                {RAGA_PRESETS[ragaId]?.name}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs font-medium">
              Style: Sitar / Vocal (Indian Classical)
            </Badge>
          </div>
        </div>

        {/* Row 1: Raga & Musical Context */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/60">
          <div className="sm:col-span-2 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground">
                Raga Scale Context (Optional - Filters Spurious Varjit Notes)
              </label>
              {ragaId !== 'none' && RAGA_PRESETS[ragaId]?.aaroh && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Aaroh: {RAGA_PRESETS[ragaId].aaroh}
                </span>
              )}
            </div>
            <Select value={ragaId} onValueChange={setRagaId}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select Raga" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(RAGA_PRESETS).map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {r.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-1 sm:pt-4">
            <div className="text-right">
              <label htmlFor="raga-toggle" className="text-xs font-medium cursor-pointer block">
                Raga Note Correction
              </label>
              <span className="text-[10px] text-muted-foreground">
                {ragaId === 'none' ? 'Disabled for Chromatic' : 'Active'}
              </span>
            </div>
            <Switch
              id="raga-toggle"
              checked={enableRagaCorrection}
              onCheckedChange={setEnableRagaCorrection}
              disabled={ragaId === 'none'}
            />
          </div>
        </div>

        {/* Settings Grid: 5 columns on sm/md/lg screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Pitch Algorithm</label>
            <Select value={algorithm} onValueChange={(val: any) => setAlgorithm(val)}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Algorithm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pyin" className="text-xs">
                  pYIN (Probabilistic - Sitar / Classical)
                </SelectItem>
                <SelectItem value="yin" className="text-xs">
                  Standard YIN
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Tala (Rhythmic Cycle)</label>
            <Select value={talaId} onValueChange={setTalaId}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select Tala" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(TALA_PRESETS).map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Composition Start Beat (Pickup)
            </label>
            <Select
              value={String(pickupBeat)}
              onValueChange={(val) => setPickupBeat(Number(val))}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select Pickup Beat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12" className="text-xs">
                  Beat 12 (Tintal Gat Standard /:11)
                </SelectItem>
                <SelectItem value="1" className="text-xs">
                  Beat 1 (Sam - Start immediately)
                </SelectItem>
                <SelectItem value="9" className="text-xs">
                  Beat 9 (Khali /:8)
                </SelectItem>
                <SelectItem value="5" className="text-xs">
                  Beat 5 (2nd Vibhag /:4)
                </SelectItem>
                <SelectItem value="7" className="text-xs">
                  Beat 7 (Rupak Khali /:6)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Rhythm Grid</label>
            <Select
              value={String(gridResolution)}
              onValueChange={(val) => setGridResolution(Number(val) as any)}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select Grid" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5" className="text-xs">
                  2 notes per beat (0.5 matra - Dugun)
                </SelectItem>
                <SelectItem value="0.25" className="text-xs">
                  4 notes per beat (0.25 matra - Chaugun)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <label className="font-medium text-muted-foreground">Tempo (BPM)</label>
              <div className="flex gap-1">
                {[50, 60, 75, 100].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`text-[10px] px-1 rounded transition-colors cursor-pointer ${
                      bpm === t
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => setBpm(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              step="1"
              min="1"
              max="500"
              value={bpm}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  setBpm(val);
                } else if (e.target.value === '') {
                  setBpm(0);
                }
              }}
              onBlur={() => {
                if (bpm <= 0) setBpm(50);
              }}
              className="w-full h-9 px-3 py-1.5 text-xs rounded-md border border-input bg-background font-mono font-semibold"
              placeholder="e.g. 50"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            onClick={runTranscription}
            disabled={isTranscribing}
            className="font-medium text-xs h-8"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {isTranscribing ? 'Transcribing...' : 'Re-Transcribe Notes'}
          </Button>
        </div>
      </div>

      {/* Result Sargam Code, Search & Replace Toolbar, and Playback */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">Transcribed Sargam Notations</h4>
            {result && (
              <Badge variant="secondary" className="text-[11px]">
                {result.notes.filter((n) => n.type === 'note').length} Notes
              </Badge>
            )}
          </div>

          {/* Dual Listen Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant={isPlayingOriginal ? 'destructive' : 'outline'}
              size="sm"
              onClick={togglePlayOriginal}
              className="text-xs flex-1 sm:flex-initial h-8"
            >
              {isPlayingOriginal ? (
                <Pause className="w-3.5 h-3.5 mr-1" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1 ml-0.5" />
              )}
              {isPlayingOriginal ? 'Stop' : 'Audio'}
            </Button>

            <Button
              variant={isPlayingSynth ? 'destructive' : 'secondary'}
              size="sm"
              onClick={togglePlaySynth}
              className="text-xs font-semibold flex-1 sm:flex-initial h-8"
            >
              <Volume2 className="w-3.5 h-3.5 mr-1" />
              {isPlayingSynth ? 'Stop' : 'Synthesized Playback'}
            </Button>
          </div>
        </div>

        {/* Synchronized Continuous Pitch Contour & Note Event Visualizer */}
        {result && result.contour && result.contour.length > 0 && (
          <PitchContourVisualizer
            contour={result.contour}
            notes={result.events || []}
            saPitch={saPitch}
            saFrequency={saFrequency}
            currentTime={playbackTime}
            isPlaying={isPlayingOriginal || isPlayingSynth}
            selectedNoteId={selectedNoteId}
            onSelectNote={(n) => setSelectedNoteId(n ? n.id : null)}
            onNotesChange={handleNotesChange}
            onSeek={handleSeek}
            onAuditionSlice={handleAuditionSlice}
          />
        )}

        {/* Interactive Note Inspector (when a note is selected) */}
        {selectedNote && (
          <NoteInspector
            note={selectedNote}
            raga={result?.raga}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            onSplitNote={handleSplitNote}
            onAuditionSlice={handleAuditionSlice}
            onAuditionSynth={handleAuditionSynth}
            onClose={() => setSelectedNoteId(null)}
          />
        )}

        {/* Search & Replace Toolbar */}
        <div className="bg-muted/40 border border-border/80 rounded-lg p-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Find Input */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find (e.g. S, or R:0.5)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFindNext();
                  }
                }}
                className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-input bg-background font-mono"
              />
            </div>

            {/* Replace Input */}
            <div className="relative flex-1 min-w-[140px]">
              <Replace className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Replace with..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleReplaceCurrent();
                  }
                }}
                className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-input bg-background font-mono"
              />
            </div>

            {/* Case Sensitive Toggle (Aa) */}
            <Button
              type="button"
              variant={isCaseSensitive ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsCaseSensitive(!isCaseSensitive)}
              className="h-8 px-2.5 text-xs font-mono font-bold"
              title={isCaseSensitive ? 'Match Case (Active - e.g. G vs g)' : 'Match Case (Inactive)'}
            >
              Aa
            </Button>

            {/* Match Navigation (Prev / Next) */}
            <div className="flex items-center gap-0.5 border border-input rounded-md bg-background p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFindPrev}
                disabled={matches.length === 0}
                className="h-7 w-7 p-0"
                title="Previous Match"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFindNext}
                disabled={matches.length === 0}
                className="h-7 w-7 p-0"
                title="Next Match"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Match Counter */}
            <span className="text-[11px] text-muted-foreground font-mono min-w-[70px] text-center">
              {searchQuery ? (matches.length > 0 ? `${currentMatchIdx + 1} of ${matches.length}` : 'No matches') : ''}
            </span>

            {/* Replace Action Buttons */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleReplaceCurrent}
              disabled={matches.length === 0}
              className="h-8 px-3 text-xs font-medium"
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="h-8 px-3 text-xs font-medium"
            >
              Replace All
            </Button>
          </div>
        </div>

        {/* Sargam Code Textarea */}
        <textarea
          ref={textareaRef}
          value={sargamCode}
          onChange={(e) => setSargamCode(e.target.value)}
          rows={9}
          className="w-full p-3 font-mono text-xs sm:text-sm rounded-lg border border-input bg-slate-950 text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary resize-y leading-relaxed"
          placeholder="Transcribed sargam notes will appear here..."
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
          <span>
            {result
              ? `Length: ~${result.totalDurationBeats.toFixed(1)} beats (${result.totalDurationSeconds.toFixed(1)}s)`
              : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-1 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-1" />
            )}
            {copied ? 'Copied' : 'Copy Sargam'}
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between pt-3 border-t border-border flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>

        <Button size="sm" onClick={handleInsert} className="font-semibold px-5">
          <Check className="w-4 h-4 mr-1.5" />
          Insert into Notebook
        </Button>
      </div>
    </div>
  );
};
