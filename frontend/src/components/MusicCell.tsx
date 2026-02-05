import { useState, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import * as Tone from "tone";
import { toast } from "sonner";
import { parseMusicCell } from "../utils/sargam_parser";
import type { MusicCell as ParsedMusicCell } from "../utils/sargam_parser";
import { MusicVisualizer } from "./MusicVisualizer";
import { createInstrument, isRhythmicInstrument, isTonalInstrument, INSTRUMENTS } from "../lib/instruments";
import type { Instrument } from "../lib/instruments";
import { Mixer, type VoiceControl } from "./music-cell/Mixer";
import { Controls } from "./music-cell/Controls";
import { useNotebookSettings } from "../context/NotebookSettingsContext";

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

export function MusicCell({ cell, onChange, theme, onFocus }: MusicCellProps) {
  const content = Array.isArray(cell.source)
    ? cell.source.join("\n")
    : cell.source;
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastParsedData, setLastParsedData] = useState<ParsedMusicCell | null>(null);
  const [voiceControls, setVoiceControls] = useState<Record<string, VoiceControl>>({});
  const [showMixer, setShowMixer] = useState(false);
  const activeNodesRef = useRef<Record<string, ActiveNode>>({});
  const { defaultInstruments, updateDefaultInstrument, showVisualizer, showCode } = useNotebookSettings();
  const [localShowVisualizer, setLocalShowVisualizer] = useState(true);
  const [localShowCode, setLocalShowCode] = useState(true);
  const [initialStartTime, setInitialStartTime] = useState(0);

  // Sync with global setting when it changes
  useEffect(() => {
    setLocalShowVisualizer(showVisualizer);
  }, [showVisualizer]);

  useEffect(() => {
    setLocalShowCode(showCode);
  }, [showCode]);

  const handleChange = (val: string) => {
    onChange({ ...cell, source: val.split("\n") });
  };

  // Parse content whenever it changes to update controls
  useEffect(() => {
    try {
      const data = parseMusicCell(content.split("\n"));
      setLastParsedData(data);

      setVoiceControls((prev) => {
        const next: Record<string, VoiceControl> = {};
        let hasChanges = false;

        // Sync voices
        Object.keys(data.voices).forEach((v) => {
          if (prev[v]) {
            next[v] = prev[v];
          } else {
            const instrument = v === "default" && defaultInstruments["default"]
              ? defaultInstruments["default"]
              : "harmonium";
            const instConfig = INSTRUMENTS[instrument];
            next[v] = {
              volume: instConfig?.defaultVolume ?? -5,
              muted: false,
              instrument
            };
            hasChanges = true;
          }
        });

        // Sync Tala
        if (data.directives.tala) {
          if (prev["__tala"]) {
            next["__tala"] = prev["__tala"];
          } else {
            const instrument = data.directives.tala_pattern ? "tabla-sampler" : "tabla";
            const instConfig = INSTRUMENTS[instrument];
            next["__tala"] = {
              volume: instConfig?.defaultVolume ?? -5,
              muted: false,
              instrument
            };
            hasChanges = true;
          }
        }

        // Initialize Chikari settings for sitar
        Object.keys(next).forEach(v => {
          const isSitar = next[v].instrument.includes("sitar");
          if (isSitar && next[v].chikariVolume === undefined) {
            const instConfig = INSTRUMENTS[next[v].instrument];
            next[v] = {
              ...next[v],
              chikariVolume: instConfig?.defaultChikariVolume ?? -5,
              chikariMuted: false
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
  }, [content, defaultInstruments]); // Add defaultInstruments to dependency to likely trigger re-init if needed? 
  // Actually, we want a separate effect for reactive updates to avoid re-parsing content.

  // Effect to sync local state with global default changes
  useEffect(() => {
    if (defaultInstruments["default"]) {
      setVoiceControls(prev => {
        const currentInstrument = prev["default"]?.instrument;
        const nextInstrument = defaultInstruments["default"];
        if (prev["default"] && currentInstrument !== nextInstrument) {
          const instConfig = INSTRUMENTS[nextInstrument];
          return {
            ...prev,
            default: {
              ...prev["default"],
              instrument: nextInstrument,
              volume: instConfig?.defaultVolume ?? -5,
              ...(nextInstrument.includes("sitar") ? { chikariVolume: instConfig?.defaultChikariVolume ?? -10 } : {})
            }
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

  const handlePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    await Tone.start();

    try {
      // Re-parse to get the latest exact structure for playback
      const data = parseMusicCell(content.split("\n"));
      setLastParsedData(data);
      await playMusic(data, voiceControls, initialStartTime);
      setIsPlaying(true);
    } catch (e) {
      console.error(e);
      toast.error("Could not parse musical notation");
    }
  };

  const stopPlayback = () => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    Object.values(activeNodesRef.current).forEach(({ synth, volumeNode, part, chikariSynth, chikariVolumeNode }) => {
      try {
        if (part) part.dispose();
        if (isRhythmicInstrument(synth)) {
          Object.values(synth.players).forEach((player) => {
            try {
              player.stop();
              player.dispose();
            } catch (e) { /* ignore */ }
          });
        } else if (isTonalInstrument(synth)) {
          if (synth instanceof Tone.PolySynth || synth instanceof Tone.Sampler) {
            (synth as any).releaseAll?.();
          }
          synth.dispose();
        }

        if (chikariSynth) {
          if (isTonalInstrument(chikariSynth)) {
            if (chikariSynth instanceof Tone.PolySynth || chikariSynth instanceof Tone.Sampler) {
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
    });
    activeNodesRef.current = {};
    setIsPlaying(false);
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

  const updateVoiceControl = (voiceName: string, updates: Partial<VoiceControl>) => {
    setVoiceControls((prev) => {
      const current = prev[voiceName];
      const next = { ...current, ...updates };

      // If instrument changed, reset volumes to defaults
      if (updates.instrument && updates.instrument !== current?.instrument) {
        const instConfig = INSTRUMENTS[updates.instrument];
        if (instConfig) {
          next.volume = instConfig.defaultVolume ?? -5;
          if (updates.instrument.includes("sitar")) {
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
    if (voiceName === "default" && updates.instrument) {
      updateDefaultInstrument("default", updates.instrument);
    }
  };

  // Helper function to convert swara notation to frequency
  const swaraToFrequency = (swara: string, variant: string | undefined, octave: number | undefined, SA_FREQ: number, scales: Record<string, number>): number => {
    // Normalize swara names
    let normalizedSwara = swara;
    if (swara.length > 1) {
      const upper = swara.toUpperCase();
      if (upper === "SA") normalizedSwara = "S";
      else if (upper === "RI") normalizedSwara = "R";
      else if (upper === "GA") normalizedSwara = "G";
      else if (upper === "MA") normalizedSwara = "M";
      else if (upper === "PA") normalizedSwara = "P";
      else if (upper === "DHA") normalizedSwara = "D";
      else if (upper === "NI") normalizedSwara = "N";
      else normalizedSwara = swara[0].toUpperCase();
    } else if (swara === 'm') {
      normalizedSwara = "M";
    }

    // Calculate semitones from scale
    let semitones = scales[normalizedSwara] || 0;

    // Apply variant
    if (variant === "k" || variant === "b") semitones -= 1;
    if (variant === "t" || variant === "#") semitones += 1;

    // Apply octave offset
    semitones += (octave || 0) * 12;

    // Calculate frequency
    return SA_FREQ * Math.pow(2, semitones / 12);
  };

  const playMusic = async (parsedData: ParsedMusicCell, currentControls: Record<string, VoiceControl>, startOffset: number = 0) => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    // Clean up previous
    Object.entries(activeNodesRef.current).forEach(([vName, { synth, volumeNode, part, chikariSynth, chikariVolumeNode }]) => {
      try {
        if (part) part.dispose();
        if (isRhythmicInstrument(synth)) {
          Object.values(synth.players).forEach((player) => {
            try { player.stop(); player.dispose(); } catch (e) { }
          });
        } else if (isTonalInstrument(synth)) {
          synth.dispose();
        }
        if (chikariSynth && isTonalInstrument(chikariSynth)) {
          chikariSynth.dispose();
        }
        volumeNode?.dispose();
        chikariVolumeNode?.dispose();
      } catch (e) { }
    });
    activeNodesRef.current = {};

    const bpmRaw =
      parsedData.directives.tempo || parsedData.directives.bpm || "120";
    const bpm = parseFloat(bpmRaw) || 120;
    Tone.getTransport().bpm.value = bpm;
    const beatDur = 60 / bpm; // Duration of one beat in seconds

    let maxDuration = 0;

    // Setup Tala
    if (parsedData.directives.tala) {
      const talaCtrl = currentControls["__tala"] || {
        volume: -5,
        muted: false,
        instrument: parsedData.directives.tala_pattern ? "tabla-sampler" : "tabla",
      };
      const talaVol = new Tone.Volume(talaCtrl.volume).toDestination();
      talaVol.mute = talaCtrl.muted;

      // Check if we have a tala pattern directive
      if (parsedData.directives.tala_pattern) {
        const pattern = parsedData.directives.tala_pattern.trim();
        const tablaInstrument = await createInstrument("tabla-sampler");

        if (isRhythmicInstrument(tablaInstrument)) {
          // Connect all players to volume node
          Object.values(tablaInstrument.players).forEach(player => player.connect(talaVol));

          // Parse pattern
          const parseTalaPattern = (patternStr: string, defaultDur: number, beatDurSeconds: number) => {
            const events: { bol: string, duration: number, time: number }[] = [];
            const cleanPattern = patternStr.split('#')[0].trim();
            const tokens = cleanPattern.split(/\s+/).filter(t => t);

            let time = 0;
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
                time += duration * beatDurSeconds;
              }
            }
            return events;
          };

          const defaultTalaDur = parseFloat(parsedData.directives.default_duration || "1.0");
          const talaEvents = parseTalaPattern(pattern, defaultTalaDur, beatDur);
          const cycleDuration = talaEvents.length > 0
            ? talaEvents[talaEvents.length - 1].time + (talaEvents[talaEvents.length - 1].duration * beatDur)
            : 4 * beatDur;

          const talaPart = new Tone.Part((time, event) => {
            const player = tablaInstrument.players[event.bol];
            if (player && player.buffer.loaded) {
              player.start(time);
            }
          }, talaEvents.map(e => ({ time: e.time, bol: e.bol })));

          talaPart.loop = true;
          talaPart.loopEnd = cycleDuration;
          talaPart.start(0);

          activeNodesRef.current["__tala"] = {
            synth: tablaInstrument,
            volumeNode: talaVol,
            part: talaPart,
          };
        }
      } else {
        // Fallback or explicit simple tabla
        const membrane = await createInstrument(talaCtrl.instrument || "tabla");
        if (isTonalInstrument(membrane)) {
          membrane.connect(talaVol);

          const talaLoop = new Tone.Loop((time) => {
            (membrane as Tone.MembraneSynth).triggerAttackRelease("C2", "8n", time);
          }, "4n");
          talaLoop.start(0);

          activeNodesRef.current["__tala"] = {
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
        console.warn("Invalid tonic:", tonicSpec);
      }
    }

    const scales: Record<string, number> = {
      S: 0, r: 1, R: 2, g: 3, G: 4, M: 5, P: 7, d: 8, D: 9, n: 10, N: 11,
    };

    for (const [voiceName, voice] of Object.entries(parsedData.voices)) {
      const volControl = currentControls[voiceName] || {
        volume: -5,
        muted: false,
        instrument: "harmonium",
      };
      const volumeNode = new Tone.Volume(volControl.volume).toDestination();
      volumeNode.mute = volControl.muted;

      const synth = await createInstrument(volControl.instrument || "synth");
      // Voices MUST be tonal for now (unless we support rhythmic voices which is rare in this context)
      if (isTonalInstrument(synth)) {
        synth.connect(volumeNode);
      }

      // Check for chikari (^) in this voice
      let chikariSynth: Instrument | undefined;
      let chikariVolumeNode: Tone.Volume | undefined;
      const hasChikari = voice.events.some(e => e.type === 'note' && (e as any).swara === '^');
      if (hasChikari) {
        chikariSynth = await createInstrument("sitar-custom-sampler");
        if (isTonalInstrument(chikariSynth)) {
          chikariVolumeNode = new Tone.Volume(volControl.chikariVolume ?? -5).toDestination();
          chikariVolumeNode.mute = volControl.chikariMuted ?? false;
          chikariSynth.connect(chikariVolumeNode);
        }
      }

      activeNodesRef.current[voiceName] = { synth, volumeNode, chikariSynth, chikariVolumeNode };

      if (!isTonalInstrument(synth)) {
        // Skip scheduling for non-tonal instruments on melody tracks for now
        // or handle differently
        continue;
      }

      let time = 0;

      voice.events.forEach((event) => {
        if ('duration' in event && event.duration) {
          const durSeconds = event.duration * beatDur;
          if (event.type === "note" && 'swara' in event && event.swara) {
            const isChingari = event.swara === '^';

            const frequencies = isChingari
              ? [
                swaraToFrequency("P", undefined, 0, SA_FREQ, scales), // P
                swaraToFrequency("S", undefined, 0, SA_FREQ, scales), // S
                swaraToFrequency("S", undefined, 1, SA_FREQ, scales), // S'
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

            const meendOrnament = !isChingari && event.ornaments?.find(
              (o) => o.name === "meend" || o.name === "slide"
            );

            if (meendOrnament && meendOrnament.params.length > 0) {
              const startFreq = frequencies[0];
              const targetSwaraStr = meendOrnament.params[0];
              // ... parsing logic for target swara ...
              let targetSwara = targetSwaraStr.trim();
              let targetVariant = undefined;
              let targetOctave = 0;

              const upper = targetSwara.toUpperCase();
              if (upper.startsWith("SA")) targetSwara = "S";
              else if (upper.startsWith("RI")) targetSwara = "R";
              else if (upper.startsWith("GA")) targetSwara = "G";
              else if (upper.startsWith("MA")) targetSwara = "M";
              else if (upper.startsWith("PA")) targetSwara = "P";
              else if (upper.startsWith("DHA")) targetSwara = "D";
              else if (upper.startsWith("NI")) targetSwara = "N";
              else {
                const firstChar = targetSwara[0]?.toUpperCase();
                if (firstChar && ["S", "R", "G", "M", "P", "D", "N"].includes(firstChar)) targetSwara = firstChar;
                else targetSwara = "S";
              }

              if (targetSwaraStr.includes("k") || targetSwaraStr.includes("b")) targetVariant = "k";
              else if (targetSwaraStr.includes("t") || targetSwaraStr.includes("#")) targetVariant = "t";

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

              let startDur = 0;
              let slideDur = durSeconds;
              let endDur = 0;
              let isThreePhase = false;

              if (meendOrnament.params.length === 4) {
                const parsedStart = parseFloat(meendOrnament.params[1]);
                const parsedSlide = parseFloat(meendOrnament.params[2]);
                const parsedEnd = parseFloat(meendOrnament.params[3]);
                if (!isNaN(parsedStart) && !isNaN(parsedSlide) && !isNaN(parsedEnd)) {
                  const totalSpecified = parsedStart + parsedSlide + parsedEnd;
                  if (totalSpecified > 0) {
                    const scale = event.duration / totalSpecified;
                    startDur = parsedStart * scale * beatDur;
                    slideDur = parsedSlide * scale * beatDur;
                    endDur = parsedEnd * scale * beatDur;
                    isThreePhase = true;
                  }
                }
              }

              Tone.getTransport().schedule((t) => {
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
                        if (i > 1) mSynth.triggerRelease(stepTime - stepDur * 0.1);
                        mSynth.triggerAttack(stepFreq, stepTime - stepDur * 0.1);
                      }
                    } else {
                      mSynth.frequency.rampTo(targetFreq, slideDur, t + startDur);
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
                      if (i > 1) mSynth.triggerRelease(stepTime - stepDur * 0.1);
                      mSynth.triggerAttack(stepFreq, stepTime - stepDur * 0.1);
                    }
                    mSynth.triggerRelease(t + slideDur);
                  } else {
                    mSynth.frequency.rampTo(targetFreq, slideDur, t);
                    mSynth.triggerRelease(t + slideDur);
                  }
                }
              }, time);
            } else {
              // Normal Note Playback
              const instrument = isChingari && chikariSynth && isTonalInstrument(chikariSynth)
                ? chikariSynth
                : synth;

              Tone.getTransport().schedule((t) => {
                if (instrument instanceof Tone.PolySynth || instrument instanceof Tone.Sampler || instrument instanceof Tone.MembraneSynth) {
                  frequencies.forEach(f => {
                    instrument.triggerAttackRelease(f, durSeconds, t);
                  });
                } else {
                  // Fallback for other tonal instruments if any
                  frequencies.forEach(f => {
                    (instrument as any).triggerAttackRelease?.(f, durSeconds, t);
                  });
                }
              }, time);
            }
          }
          time += durSeconds;
        }
      });
      if (time > maxDuration) maxDuration = time;
    }

    Tone.getTransport().start(undefined, startOffset);
    Tone.getTransport().schedule(() => {
      stopPlayback();
    }, maxDuration + 0.1);
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
      <div className="p-1 overflow-x-auto max-w-full">
        <div className="min-w-0">
          <div className={localShowCode ? "" : "relative h-[50px] overflow-hidden select-none"}>
            <CodeMirror
              value={content}
              height="auto"
              extensions={[markdown()]}
              onChange={handleChange}
              onFocus={onFocus}
              theme={theme === 'dark' ? 'dark' : 'light'}
              className="text-base md:text-sm font-mono focus-within:ring-0"
              readOnly={!localShowCode}
            />
            {!localShowCode && (
              <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-md flex items-center justify-center border-b border-border/50">
                <button
                  onClick={() => setLocalShowCode(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow-lg hover:bg-primary/90 transition-colors cursor-pointer z-50 pointer-events-auto"
                >
                  Show Music Code
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {(localShowVisualizer || (isPlaying && lastParsedData)) && (
        <div className="px-3 md:px-4 pb-4 overflow-x-auto max-w-full">
          <div className="min-w-0">
            <MusicVisualizer
              parsedData={lastParsedData}
              isPlaying={isPlaying}
              onPlay={handlePlay}
              initialTime={initialStartTime}
              onSeek={handleSeek}
            />
          </div>
        </div>
      )}
    </div>
  );
}
