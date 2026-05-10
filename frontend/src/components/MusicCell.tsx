import { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { toast } from 'sonner';
import { parseMusicCell } from '../utils/sargam_parser';
import type { MusicCell as ParsedMusicCell } from '../utils/sargam_parser';
import { MusicVisualizer } from './MusicVisualizer';
import {
  createInstrument,
  isRhythmicInstrument,
  isTonalInstrument,
  INSTRUMENTS,
} from '../lib/instruments';
import type { Instrument } from '../lib/instruments';
import { Mixer, type VoiceControl } from './music-cell/Mixer';
import { Controls } from './music-cell/Controls';
import { useNotebookSettings } from '../context/NotebookSettingsContext';
import { usePlaybackStore } from '../store/usePlaybackStore';
import { useIsMobile } from '../hooks/use-mobile';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from './ui/button';
import { CornerDownLeftIcon, DeleteIcon, Save } from 'lucide-react';

interface MusicCellProps {
  cell: {
    cell_type: string;
    source: string[] | string;
    metadata?: {
      language?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  onChange: (cell: any) => void;
  theme: string;
  onFocus?: () => void;
}

interface ActiveNode {
  synth: Instrument;
  volumeNode: Tone.Volume;
  part?: Tone.Part | Tone.Loop | Tone.ToneEvent;
  chikariSynth?: Instrument;
  chikariVolumeNode?: Tone.Volume;
}

const beatsToTime = (beats: number) => {
  const bars = Math.floor(beats / 4);
  const quarters = Math.floor(beats % 4);
  const sixteenths = (beats % 1) * 4;
  return `${bars}:${quarters}:${sixteenths.toFixed(2)}`;
};

// Tone.Transport can miss events scheduled exactly on a loop boundary.
// Nudge note events by an imperceptible amount so the first note fires after wrap.
const LOOP_BOUNDARY_EPSILON_BEATS = 0.001;
const beatsToScheduledTime = (beats: number) =>
  beatsToTime(beats + LOOP_BOUNDARY_EPSILON_BEATS);

export function MusicCell({ cell, onChange, onFocus }: MusicCellProps) {
  const content = Array.isArray(cell.source)
    ? cell.source.join('\n')
    : cell.source;
  const [editorValue, setEditorValue] = useState(content);
  const [savedContent, setSavedContent] = useState(content);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastParsedData, setLastParsedData] = useState<ParsedMusicCell | null>(
    null
  );
  const [voiceControls, setVoiceControls] = useState<
    Record<string, VoiceControl>
  >({});
  const [showMixer, setShowMixer] = useState(false);
  const activeNodesRef = useRef<Record<string, ActiveNode>>({});
  const {
    setActiveCell,
    clearActiveCell,
    registerCellController,
    unregisterCellController,
  } = usePlaybackStore();
  const {
    defaultInstruments,
    updateDefaultInstrument,
    showVisualizer,
    showCode,
  } = useNotebookSettings();
  const [localShowVisualizer, setLocalShowVisualizer] = useState(true);
  const [localShowCode, setLocalShowCode] = useState(true);
  const [initialStartTime, setInitialStartTime] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [keyboardMinimized, setKeyboardMinimized] = useState(false);
  const [useNormalKeyboard, setUseNormalKeyboard] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  // Sync with global setting when it changes
  useEffect(() => {
    setLocalShowVisualizer(showVisualizer);
  }, [showVisualizer]);

  useEffect(() => {
    setLocalShowCode(showCode);
  }, [showCode]);

  useEffect(() => {
    setEditorValue(content);
    setSavedContent(content);
  }, [content]);

  const handleChange = (val: string) => {
    setEditorValue(val);
  };

  const handleEditorFocus = () => {
    setIsEditorFocused(true);
    onFocus?.();
  };

  const handleEditorBlur = () => {
    window.setTimeout(() => {
      if (document.activeElement !== textareaRef.current) {
        setIsEditorFocused(false);
        setUseNormalKeyboard(false);
      }
    }, 0);
  };

  const handleSave = () => {
    setSavedContent(editorValue);
    onChange({ ...cell, source: editorValue.split('\n') });
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setEditorValue((prev) => prev + text);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue =
      editorValue.slice(0, start) + text + editorValue.slice(end);
    const nextCursor = start + text.length;

    setEditorValue(nextValue);
    requestAnimationFrame(() => {
      if (!isMobile) textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const deleteAtCursor = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setEditorValue((prev) => prev.slice(0, -1));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const nextValue = editorValue.slice(0, start) + editorValue.slice(end);
      setEditorValue(nextValue);
      requestAnimationFrame(() => textarea.setSelectionRange(start, start));
      return;
    }

    if (start === 0) return;

    const nextCursor = start - 1;
    const nextValue =
      editorValue.slice(0, nextCursor) + editorValue.slice(start);
    setEditorValue(nextValue);
    requestAnimationFrame(() => textarea.setSelectionRange(nextCursor, nextCursor));
  };

  const notationKeys = [
    { tooltip: 'sa', label: 'S', value: 'S' },
    { tooltip: 're (komal)', label: 'r', value: 'r' },
    { tooltip: 're', label: 'R', value: 'R' },
    { tooltip: 'ga (komal)', label: 'g', value: 'g' },
    { tooltip: 'ga', label: 'G', value: 'G' },
    { tooltip: 'ma', label: 'M', value: 'M' },
    { tooltip: 'ma (tivra)', label: 'Mt', value: 'Mt' },
    { tooltip: 'pa', label: 'P', value: 'P' },
    { tooltip: 'dha (komal)', label: 'd', value: 'd' },
    { tooltip: 'dha', label: 'D', value: 'D' },
    { tooltip: 'ni (komal)', label: 'n', value: 'n' },
    { tooltip: 'ni', label: 'N', value: 'N' },
  ];

  const octaveKeys = [
    { tooltip: 'lower octave', label: ',', value: ',' },
    { tooltip: 'upper octave', label: "'", value: "'" },
  ];

  const durationKeys = [
    { tooltip: 'quarter note', label: ': 1/4', value: ':0.25 ' },
    { tooltip: 'half note', label: ': 1/2', value: ':0.5 ' },
    { tooltip: 'whole note', label: ': 1', value: ':1 ' },
    { tooltip: '|', label: '|', value: '| ' },
    { tooltip: '||', label: '||', value: '|| \n' },
    { tooltip: 'space', label: '⎵', value: ' ' },
  ];

  const hasUnsavedChanges = editorValue !== savedContent;

  // Parse saved content only. The visualizer updates after pressing Save.
  useEffect(() => {
    try {
      const data = parseMusicCell(savedContent.split('\n'));

      if (!bpm && !data.directives.tempo) setBpm(80);
      if (!bpm && data.directives.tempo)
        setBpm(parseFloat(data.directives.tempo));
      if (bpm) data.directives.tempo = bpm.toString();
      Tone.getTransport().bpm.value = bpm ?? 80;

      setLastParsedData(data);

      setVoiceControls((prev) => {
        const next: Record<string, VoiceControl> = {};
        let hasChanges = false;

        // Sync voices
        Object.keys(data.voices).forEach((v) => {
          if (prev[v]) {
            next[v] = prev[v];
          } else {
            const instrument =
              v === 'default' && defaultInstruments['default']
                ? defaultInstruments['default']
                : 'harmonium';
            const instConfig = INSTRUMENTS[instrument];
            next[v] = {
              volume: instConfig?.defaultVolume ?? -5,
              muted: false,
              instrument,
            };
            hasChanges = true;
          }
        });

        // Sync Tala
        if (data.directives.tala) {
          if (prev['__tala']) {
            next['__tala'] = prev['__tala'];
          } else {
            const instrument = data.directives.tala_pattern
              ? 'tabla-sampler'
              : 'tabla';
            const instConfig = INSTRUMENTS[instrument];
            next['__tala'] = {
              volume: instConfig?.defaultVolume ?? -5,
              muted: false,
              instrument,
            };
            hasChanges = true;
          }
        }

        // Initialize Chikari settings for sitar
        Object.keys(next).forEach((v) => {
          const isSitar = next[v].instrument.includes('sitar');
          if (isSitar && next[v].chikariVolume === undefined) {
            const instConfig = INSTRUMENTS[next[v].instrument];
            next[v] = {
              ...next[v],
              chikariVolume: instConfig?.defaultChikariVolume ?? -5,
              chikariMuted: false,
            };
            hasChanges = true;
          }
        });

        // Check if any keys were removed
        if (!hasChanges) {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(next);
          if (prevKeys.length !== nextKeys.length) {
            hasChanges = true;
          } else {
            for (const key of prevKeys) {
              if (!next[key]) {
                hasChanges = true;
                break;
              }
            }
          }
        }

        return hasChanges ? next : prev;
      });
    } catch (e) {
      // silent fail on type; waiting for valid input
    }
  }, [savedContent, defaultInstruments, bpm]); // Add defaultInstruments to dependency to likely trigger re-init if needed?
  // Actually, we want a separate effect for reactive updates to avoid re-parsing content.

  // Effect to sync local state with global default changes
  useEffect(() => {
    if (defaultInstruments['default']) {
      setVoiceControls((prev) => {
        const currentInstrument = prev['default']?.instrument;
        const nextInstrument = defaultInstruments['default'];
        if (prev['default'] && currentInstrument !== nextInstrument) {
          const instConfig = INSTRUMENTS[nextInstrument];
          return {
            ...prev,
            default: {
              ...prev['default'],
              instrument: nextInstrument,
              volume: instConfig?.defaultVolume ?? -5,
              ...(nextInstrument.includes('sitar')
                ? { chikariVolume: instConfig?.defaultChikariVolume ?? -10 }
                : {}),
            },
          };
        }
        return prev;
      });
    }
  }, [defaultInstruments]);

  const handleSeek = (time: number) => {
    setInitialStartTime(time);
    if (isPlaying) {
      // If already playing, we need to jump
      Tone.getTransport().seconds = time;
    }
  };

  const playPromiseResolveRef = useRef<((isNatural: boolean) => void) | null>(
    null
  );

  const handlePlay = async (): Promise<boolean> => {
    if (isPlaying) {
      stopPlayback(false);
      return Promise.resolve(false);
    }

    const parsedForPlayback = lastParsedData;

    if (!parsedForPlayback) {
      toast.error('Could not parse musical notation');
      return Promise.resolve(false);
    }

    await Tone.start();

    return new Promise<boolean>(async (resolve) => {
      playPromiseResolveRef.current = resolve;
      try {
        setActiveCell(cell.id, () => stopPlayback(false));
        await playMusic(parsedForPlayback, voiceControls, initialStartTime);
        setIsPlaying(true);
      } catch (e) {
        console.error(e);
        toast.error('Could not parse musical notation');
        resolve(false);
      }
    });
  };

  const handlePlayRef = useRef(handlePlay);
  handlePlayRef.current = handlePlay;

  useEffect(() => {
    const playFn = () => handlePlayRef.current();
    registerCellController(cell.id, playFn);
    return () => unregisterCellController(cell.id);
  }, [cell.id, registerCellController, unregisterCellController]);

  const stopPlayback = (isNatural: boolean = false) => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    Object.values(activeNodesRef.current).forEach(
      ({ synth, volumeNode, part, chikariSynth, chikariVolumeNode }) => {
        try {
          if (part) part.dispose();
          if (isRhythmicInstrument(synth)) {
            Object.values(synth.players).forEach((player) => {
              try {
                player.stop();
                player.dispose();
              } catch (e) {
                /* ignore */
              }
            });
          } else if (isTonalInstrument(synth)) {
            if (
              synth instanceof Tone.PolySynth ||
              synth instanceof Tone.Sampler
            ) {
              (synth as any).releaseAll?.();
            }
            synth.dispose();
          }

          if (chikariSynth) {
            if (isTonalInstrument(chikariSynth)) {
              if (
                chikariSynth instanceof Tone.PolySynth ||
                chikariSynth instanceof Tone.Sampler
              ) {
                (chikariSynth as any).releaseAll?.();
              }
              chikariSynth.dispose();
            }
          }

          volumeNode?.dispose();
          chikariVolumeNode?.dispose();
        } catch (e) {
          /* ignore */
        }
      }
    );
    activeNodesRef.current = {};
    clearActiveCell(cell.id);
    setIsPlaying(false);

    if (playPromiseResolveRef.current) {
      playPromiseResolveRef.current(isNatural);
      playPromiseResolveRef.current = null;
    }
  };

  useEffect(() => {
    // Apply real-time volume/mute changes
    Object.entries(voiceControls).forEach(([voiceName, control]) => {
      const nodes = activeNodesRef.current[voiceName];
      if (nodes) {
        if (nodes.volumeNode) {
          nodes.volumeNode.mute = control.muted;
          nodes.volumeNode.volume.rampTo(control.volume, 0.1);
        }
        if (nodes.chikariVolumeNode && control.chikariVolume !== undefined) {
          nodes.chikariVolumeNode.mute = control.chikariMuted ?? false;
          nodes.chikariVolumeNode.volume.rampTo(control.chikariVolume, 0.1);
        }
      }
    });
  }, [voiceControls]);

  useEffect(() => {
    if (isPlaying) {
      Tone.getTransport().loop = isLooping;
    }
  }, [isLooping, isPlaying]);

  const updateVoiceControl = (
    voiceName: string,
    updates: Partial<VoiceControl>
  ) => {
    setVoiceControls((prev) => {
      const current = prev[voiceName];
      const next = { ...current, ...updates };

      // If instrument changed, reset volumes to defaults
      if (updates.instrument && updates.instrument !== current?.instrument) {
        const instConfig = INSTRUMENTS[updates.instrument];
        if (instConfig) {
          next.volume = instConfig.defaultVolume ?? -5;
          if (updates.instrument.includes('sitar')) {
            next.chikariVolume = instConfig.defaultChikariVolume ?? -10;
          }
        }
      }

      return {
        ...prev,
        [voiceName]: next,
      };
    });

    // If updating instrument for default voice, propagate globally
    if (voiceName === 'default' && updates.instrument) {
      updateDefaultInstrument('default', updates.instrument);
    }
  };

  // Helper function to convert swara notation to frequency
  const swaraToFrequency = (
    swara: string,
    variant: string | undefined,
    octave: number | undefined,
    SA_FREQ: number,
    scales: Record<string, number>
  ): number => {
    // Normalize swara names
    let normalizedSwara = swara;
    if (swara.length > 1) {
      const upper = swara.toUpperCase();
      if (upper === 'SA') normalizedSwara = 'S';
      else if (upper === 'RI') normalizedSwara = 'R';
      else if (upper === 'GA') normalizedSwara = 'G';
      else if (upper === 'MA') normalizedSwara = 'M';
      else if (upper === 'PA') normalizedSwara = 'P';
      else if (upper === 'DHA') normalizedSwara = 'D';
      else if (upper === 'NI') normalizedSwara = 'N';
      else normalizedSwara = swara[0].toUpperCase();
    } else if (swara === 'm') {
      normalizedSwara = 'M';
    }

    // Calculate semitones from scale
    let semitones = scales[normalizedSwara] || 0;

    // Apply variant
    if (variant === 'k' || variant === 'b') semitones -= 1;
    if (variant === 't' || variant === '#') semitones += 1;

    // Apply octave offset
    semitones += (octave || 0) * 12;

    // Calculate frequency
    return SA_FREQ * Math.pow(2, semitones / 12);
  };

  const playMusic = async (
    parsedData: ParsedMusicCell,
    currentControls: Record<string, VoiceControl>,
    startOffset: number = 0
  ) => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    // Clean up previous
    Object.entries(activeNodesRef.current).forEach(
      ([
        _vName,
        { synth, volumeNode, part, chikariSynth, chikariVolumeNode },
      ]) => {
        try {
          if (part) part.dispose();
          if (isRhythmicInstrument(synth)) {
            Object.values(synth.players).forEach((player) => {
              try {
                player.stop();
                player.dispose();
              } catch (e) {}
            });
          } else if (isTonalInstrument(synth)) {
            synth.dispose();
          }
          if (chikariSynth && isTonalInstrument(chikariSynth)) {
            chikariSynth.dispose();
          }
          volumeNode?.dispose();
          chikariVolumeNode?.dispose();
        } catch (e) {}
      }
    );
    activeNodesRef.current = {};

    const bpmRaw = bpm || 80;
    Tone.getTransport().bpm.value = bpmRaw;
    // We do NOT use beatDur for scheduling time anymore, only for duration calculation inside callbacks
    // const beatDur = 60 / bpm;

    let initialSkipBeats = 0;
    const mainVoice =
      parsedData.voices['default'] || Object.values(parsedData.voices)[0];
    if (mainVoice) {
      for (const event of mainVoice.events) {
        if (event.type === 'skip') {
          initialSkipBeats += event.duration;
        } else if (event.type !== 'comment' && event.type !== 'bar') {
          break;
        }
      }
    }

    let maxDuration = 0; // in beats

    // Setup Tala
    if (parsedData.directives.tala) {
      const talaCtrl = currentControls['__tala'] || {
        volume: -5,
        muted: false,
        instrument: parsedData.directives.tala_pattern
          ? 'tabla-sampler'
          : 'tabla',
      };
      const talaVol = new Tone.Volume(talaCtrl.volume).toDestination();
      talaVol.mute = talaCtrl.muted;

      // Check if we have a tala pattern directive
      if (parsedData.directives.tala_pattern) {
        const pattern = parsedData.directives.tala_pattern.trim();
        const tablaInstrument = await createInstrument('tabla-sampler');

        if (isRhythmicInstrument(tablaInstrument)) {
          // Connect all players to volume node
          Object.values(tablaInstrument.players).forEach((player) =>
            player.connect(talaVol)
          );

          // Parse pattern
          const parseTalaPattern = (patternStr: string, defaultDur: number) => {
            const events: { bol: string; duration: number; time: number }[] =
              [];
            const cleanPattern = patternStr.split('#')[0].trim();
            const tokens = cleanPattern.split(/\s+/).filter((t) => t);

            let time = 0; // in beats
            for (const token of tokens) {
              if (token === '|' || token === '||') continue;

              const colonIdx = token.lastIndexOf(':');
              let bol = token;
              let duration = defaultDur;

              if (colonIdx !== -1) {
                const durStr = token.slice(colonIdx + 1);
                const parsedDur = parseFloat(durStr);
                if (!isNaN(parsedDur) && parsedDur > 0) {
                  duration = parsedDur;
                  bol = token.slice(0, colonIdx);
                }
              }

              if (bol) {
                const eventTime = time;
                events.push({ bol, duration, time: eventTime });
                time += duration; // increment by beats
              }
            }
            return events;
          };

          const defaultTalaDur = parseFloat(
            parsedData.directives.default_duration || '1.0'
          );
          const talaEvents = parseTalaPattern(pattern, defaultTalaDur);
          const cycleDurationBeats =
            talaEvents.length > 0
              ? talaEvents[talaEvents.length - 1].time +
                talaEvents[talaEvents.length - 1].duration
              : 4;

          const talaPart = new Tone.Part(
            (time, event) => {
              const player = tablaInstrument.players[event.bol];
              if (player && player.buffer.loaded) {
                player.start(time);
              }
            },
            talaEvents.map((e) => ({
              time: beatsToTime(e.time),
              bol: e.bol,
            }))
          );

          talaPart.loop = true;
          talaPart.loopEnd = beatsToTime(cycleDurationBeats);
          const offsetBeats =
            cycleDurationBeats > 0 ? initialSkipBeats % cycleDurationBeats : 0;
          talaPart.start(0, beatsToTime(offsetBeats));

          activeNodesRef.current['__tala'] = {
            synth: tablaInstrument,
            volumeNode: talaVol,
            part: talaPart,
          };
        }
      } else {
        // Fallback or explicit simple tabla
        const membrane = await createInstrument(talaCtrl.instrument || 'tabla');
        if (isTonalInstrument(membrane)) {
          membrane.connect(talaVol);

          const talaLoop = new Tone.Loop((time) => {
            (membrane as Tone.MembraneSynth).triggerAttackRelease(
              'C2',
              '8n',
              time
            );
          }, '4n');
          talaLoop.start(0);

          activeNodesRef.current['__tala'] = {
            synth: membrane,
            volumeNode: talaVol,
            part: talaLoop,
          };
        }
      }
    }

    // Setup Voices
    let SA_FREQ = 261.63;
    const tonicSpec = parsedData.directives.sa || parsedData.directives.tonic;
    if (tonicSpec) {
      try {
        const freq = Tone.Frequency(tonicSpec).toFrequency();
        if (!isNaN(freq) && freq > 0) SA_FREQ = freq;
      } catch (e) {
        console.warn('Invalid tonic:', tonicSpec);
      }
    }

    const scales: Record<string, number> = {
      S: 0,
      r: 1,
      R: 2,
      g: 3,
      G: 4,
      M: 5,
      P: 7,
      d: 8,
      D: 9,
      n: 10,
      N: 11,
    };

    for (const [voiceName, voice] of Object.entries(parsedData.voices)) {
      const volControl = currentControls[voiceName] || {
        volume: -5,
        muted: false,
        instrument: 'harmonium',
      };
      const volumeNode = new Tone.Volume(volControl.volume).toDestination();
      volumeNode.mute = volControl.muted;

      const synth = await createInstrument(volControl.instrument || 'synth');
      // Voices MUST be tonal for now
      if (isTonalInstrument(synth)) {
        synth.connect(volumeNode);
      }

      // Check for chikari (^) in this voice
      let chikariSynth: Instrument | undefined;
      let chikariVolumeNode: Tone.Volume | undefined;
      const hasChikari = voice.events.some(
        (e) => e.type === 'note' && (e as any).swara === '^'
      );
      if (hasChikari) {
        chikariSynth = await createInstrument('sitar-custom-sampler');
        if (isTonalInstrument(chikariSynth)) {
          chikariVolumeNode = new Tone.Volume(
            volControl.chikariVolume ?? -5
          ).toDestination();
          chikariVolumeNode.mute = volControl.chikariMuted ?? false;
          chikariSynth.connect(chikariVolumeNode);
        }
      }

      activeNodesRef.current[voiceName] = {
        synth,
        volumeNode,
        chikariSynth,
        chikariVolumeNode,
      };

      if (!isTonalInstrument(synth)) {
        // Skip scheduling for non-tonal instruments on melody tracks for now
        // or handle differently
        continue;
      }

      let currentTimeBeats = 0;

      voice.events.forEach((event) => {
        if ('duration' in event && event.duration) {
          // Event duration in beats
          const durBeats = event.duration;

          if (event.type === 'skip') {
            // Skip events consume NO audio time
            return;
          }

          if (event.type === 'note' && 'swara' in event && event.swara) {
            const isChingari = event.swara === '^';

            const frequencies = isChingari
              ? [
                  swaraToFrequency('P', undefined, 0, SA_FREQ, scales), // P
                  swaraToFrequency('S', undefined, 0, SA_FREQ, scales), // S
                  swaraToFrequency('S', undefined, 1, SA_FREQ, scales), // S'
                ]
              : [
                  swaraToFrequency(
                    event.swara,
                    event.variant,
                    event.octave,
                    SA_FREQ,
                    scales
                  ),
                ];

            const meendOrnament =
              !isChingari &&
              event.ornaments?.find(
                (o) => o.name === 'meend' || o.name === 'slide'
              );

            if (meendOrnament && meendOrnament.params.length > 0) {
              const startFreq = frequencies[0];
              const targetSwaraStr = meendOrnament.params[0];
              // ... parsing logic for target swara ...
              let targetSwara = targetSwaraStr.trim();
              let targetVariant = undefined;
              let targetOctave = 0;

              const upper = targetSwara.toUpperCase();
              if (upper.startsWith('SA')) targetSwara = 'S';
              else if (upper.startsWith('RI')) targetSwara = 'R';
              else if (upper.startsWith('GA')) targetSwara = 'G';
              else if (upper.startsWith('MA')) targetSwara = 'M';
              else if (upper.startsWith('PA')) targetSwara = 'P';
              else if (upper.startsWith('DHA')) targetSwara = 'D';
              else if (upper.startsWith('NI')) targetSwara = 'N';
              else {
                const firstChar = targetSwara[0]?.toUpperCase();
                if (
                  firstChar &&
                  ['S', 'R', 'G', 'M', 'P', 'D', 'N'].includes(firstChar)
                )
                  targetSwara = firstChar;
                else targetSwara = 'S';
              }

              if (targetSwaraStr.includes('k') || targetSwaraStr.includes('b'))
                targetVariant = 'k';
              else if (
                targetSwaraStr.includes('t') ||
                targetSwaraStr.includes('#')
              )
                targetVariant = 't';

              const octaveUp = (targetSwaraStr.match(/'/g) || []).length;
              const octaveDown = (targetSwaraStr.match(/,/g) || []).length;
              targetOctave = octaveUp - octaveDown;

              const targetFreq = swaraToFrequency(
                targetSwara,
                targetVariant,
                targetOctave,
                SA_FREQ,
                scales
              );

              const isSampler = synth instanceof Tone.Sampler;
              const isPolySynth = synth instanceof Tone.PolySynth;
              const needsTempSynth = isSampler || isPolySynth;

              Tone.getTransport().schedule((t) => {
                // Calculate dynamic seconds based on current BPM at trigger time
                const currentBeatDur = 60 / Tone.Transport.bpm.value;
                const totalDurSeconds = durBeats * currentBeatDur;

                // Scale for meend parts
                let startDur = 0;
                let slideDur = totalDurSeconds;
                let endDur = 0;
                let isThreePhase = false;

                if (meendOrnament.params.length === 4) {
                  const parsedStart = parseFloat(meendOrnament.params[1]);
                  const parsedSlide = parseFloat(meendOrnament.params[2]);
                  const parsedEnd = parseFloat(meendOrnament.params[3]);
                  if (
                    !isNaN(parsedStart) &&
                    !isNaN(parsedSlide) &&
                    !isNaN(parsedEnd)
                  ) {
                    const totalSpecified =
                      parsedStart + parsedSlide + parsedEnd;
                    if (totalSpecified > 0) {
                      const scale = durBeats / totalSpecified;
                      startDur = parsedStart * scale * currentBeatDur;
                      slideDur = parsedSlide * scale * currentBeatDur;
                      endDur = parsedEnd * scale * currentBeatDur;
                      isThreePhase = true;
                    }
                  }
                }

                // If it needs a temp synth, create one. It will be a standard Synth (monophonic, tonal)
                const meendSynth = needsTempSynth
                  ? new Tone.Synth().connect(volumeNode)
                  : synth;

                // Let's coerce for the complex logic
                const mSynth = meendSynth as any;

                if (isThreePhase) {
                  mSynth.triggerAttack(startFreq, t);

                  if (slideDur > 0) {
                    if (needsTempSynth) {
                      const steps = Math.max(20, Math.floor(slideDur * 30));
                      const stepDur = slideDur / steps;
                      const freqStep = (targetFreq - startFreq) / steps;
                      for (let i = 1; i <= steps; i++) {
                        const stepTime = t + startDur + i * stepDur;
                        const stepFreq = startFreq + i * freqStep;
                        if (i > 1)
                          mSynth.triggerRelease(stepTime - stepDur * 0.1);
                        mSynth.triggerAttack(
                          stepFreq,
                          stepTime - stepDur * 0.1
                        );
                      }
                    } else {
                      mSynth.frequency.rampTo(
                        targetFreq,
                        slideDur,
                        t + startDur
                      );
                    }
                  }
                  mSynth.triggerRelease(t + startDur + slideDur + endDur);
                } else {
                  mSynth.triggerAttack(startFreq, t);

                  if (needsTempSynth) {
                    const steps = Math.max(20, Math.floor(slideDur * 30));
                    const stepDur = slideDur / steps;
                    const freqStep = (targetFreq - startFreq) / steps;
                    for (let i = 1; i <= steps; i++) {
                      const stepTime = t + i * stepDur;
                      const stepFreq = startFreq + i * freqStep;
                      if (i > 1)
                        mSynth.triggerRelease(stepTime - stepDur * 0.1);
                      mSynth.triggerAttack(stepFreq, stepTime - stepDur * 0.1);
                    }
                    mSynth.triggerRelease(t + slideDur);
                  } else {
                    mSynth.frequency.rampTo(targetFreq, slideDur, t);
                    mSynth.triggerRelease(t + slideDur);
                  }
                }
              }, beatsToScheduledTime(currentTimeBeats));
            } else {
              // Normal Note Playback
              const instrument =
                isChingari && chikariSynth && isTonalInstrument(chikariSynth)
                  ? chikariSynth
                  : synth;

              Tone.getTransport().schedule((t) => {
                const currentBeatDur = 60 / Tone.Transport.bpm.value;
                const durSeconds = durBeats * currentBeatDur;

                if (
                  instrument instanceof Tone.PolySynth ||
                  instrument instanceof Tone.Sampler ||
                  instrument instanceof Tone.MembraneSynth
                ) {
                  frequencies.forEach((f) => {
                    instrument.triggerAttackRelease(f, durSeconds, t);
                  });
                } else {
                  // Fallback for other tonal instruments if any
                  frequencies.forEach((f) => {
                    (instrument as any).triggerAttackRelease?.(
                      f,
                      durSeconds,
                      t
                    );
                  });
                }
              }, beatsToScheduledTime(currentTimeBeats));
            }
          }
          currentTimeBeats += durBeats;
        }
      });
      if (currentTimeBeats > maxDuration) maxDuration = currentTimeBeats;
    }

    Tone.getTransport().loopStart = startOffset;
    Tone.getTransport().loopEnd = beatsToTime(maxDuration);
    Tone.getTransport().loop = isLooping;

    Tone.getTransport().start(undefined, startOffset);
    Tone.getTransport().schedule(
      () => {
        if (!Tone.getTransport().loop) {
          stopPlayback(true);
        }
      },
      beatsToTime(maxDuration + 0.5)
    );
  };

  return (
    <div className="flex flex-col relative max-w-full overflow-hidden">
      <Controls
        isPlaying={isPlaying}
        onPlay={handlePlay}
        mixerOpen={showMixer}
        onToggleMixer={() => setShowMixer(!showMixer)}
        showVisualizer={localShowVisualizer}
        onToggleVisualizer={() => setLocalShowVisualizer(!localShowVisualizer)}
        showCode={localShowCode}
        onToggleCode={() => setLocalShowCode(!localShowCode)}
        mixerContent={
          <Mixer
            show={showMixer}
            onClose={() => setShowMixer(false)}
            voiceControls={voiceControls}
            updateVoiceControl={updateVoiceControl}
            parsedData={lastParsedData}
          />
        }
      />
      <div className="p-2 max-w-full">
        <div className="min-w-0">
          <div
            className={
              localShowCode
                ? ''
                : 'relative h-[50px] overflow-hidden select-none'
            }
          >
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={editorValue}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={handleEditorFocus}
                onBlur={handleEditorBlur}
                readOnly={!localShowCode}
                inputMode={isMobile && !useNormalKeyboard ? 'none' : undefined}
                spellCheck={false}
                className="w-full resize-none overflow-hidden rounded-md border border-border bg-background/70 px-3 py-2 pb-12 text-base md:text-sm font-mono text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  height: `${textareaRef.current?.scrollHeight || 160}px`,
                }}
              />
              {localShowCode && hasUnsavedChanges && (
                <Button
                  size={'sm'}
                  onClick={handleSave}
                  className="absolute top-3 right-3"
                >
                  <Save className="w-4 h-4" />
                </Button>
              )}
              {localShowCode && hasUnsavedChanges && (
                <Button
                  size={'sm'}
                  onClick={handleSave}
                  className="absolute bottom-3 right-3"
                >
                  <Save className="w-4 h-4" />
                </Button>
              )}
            </div>

            {!localShowCode && (
              <div className="absolute inset-0 z-10 bg-background flex items-center justify-center border-b border-border/50">
                <Button
                  type="button"
                  onClick={() => setLocalShowCode(true)}
                  className="z-50 pointer-events-auto"
                >
                  Show Music Code
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      {localShowCode && isEditorFocused && keyboardMinimized && (
        <Button
          size="sm"
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setKeyboardMinimized(false)}
          className="fixed bottom-3 right-3 z-50"
        >
          Show keyboard
        </Button>
      )}
      {localShowCode && isEditorFocused && !keyboardMinimized && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background p-2">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-2">
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {notationKeys.map((key) => (
                  <Tooltip key={key.label} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertAtCursor(key.value)}
                      >
                        {key.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{key.tooltip}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setKeyboardMinimized(true)}
              >
                Minimise
              </Button>
            </div>

            <div className="flex w-full flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {octaveKeys.map((key) => (
                  <Tooltip key={key.label} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertAtCursor(key.value)}
                      >
                        {key.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{key.tooltip}</TooltipContent>
                  </Tooltip>
                ))}
                {durationKeys.map((key) => (
                  <Tooltip key={key.label} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertAtCursor(key.value)}
                      >
                        {key.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{key.tooltip}</TooltipContent>
                  </Tooltip>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    insertAtCursor('\n');
                  }}
                >
                  <CornerDownLeftIcon className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={deleteAtCursor}
                >
                  <DeleteIcon className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges}
                >
                  Save
                </Button>
                {isMobile && (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setKeyboardMinimized(true);
                      setUseNormalKeyboard(true);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  >
                    show normal keyboard
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {(localShowVisualizer || (isPlaying && lastParsedData)) && bpm && (
        <div className="px-3 md:px-4 pb-4 overflow-x-auto max-w-full">
          <div className="min-w-0">
            <MusicVisualizer
              parsedData={lastParsedData}
              isPlaying={isPlaying}
              onPlay={handlePlay}
              initialTime={initialStartTime}
              onSeek={handleSeek}
              bpm={bpm}
              setBpm={setBpm}
              isLooping={isLooping}
              onToggleLoop={() => setIsLooping(!isLooping)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
