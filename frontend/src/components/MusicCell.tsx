import React, { useState, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import * as Tone from "tone";
import { toast } from "sonner";
import { Play, Square, Volume2, VolumeX, Settings2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { parseMusicCell } from "../utils/sargam_parser";
import type { MusicCell as ParsedMusicCell } from "../utils/sargam_parser";
import { MusicVisualizer } from "./MusicVisualizer";
import { createInstrument, INSTRUMENTS } from "../lib/instruments";
import type { Instrument } from "../lib/instruments";
import { Button } from "./ui/button";

// Type guard for tabla-sampler
function isTablaSampler(instrument: Instrument): instrument is { type: 'tabla-sampler', players: Record<string, Tone.Player> } {
  return typeof instrument === 'object' && instrument !== null && 'type' in instrument && instrument.type === 'tabla-sampler';
}

// Type guard for Tone instruments
function isToneInstrument(instrument: Instrument): instrument is Tone.Sampler | Tone.PolySynth | Tone.MembraneSynth {
  return !isTablaSampler(instrument);
}

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
}

interface VoiceControl {
  volume: number;
  muted: boolean;
  instrument: string;
}

interface ActiveNode {
  synth: Instrument;
  volumeNode: Tone.Volume;
}

export function MusicCell({ cell, onChange, theme }: MusicCellProps) {
  const content = Array.isArray(cell.source)
    ? cell.source.join("\n")
    : cell.source;
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastParsedData, setLastParsedData] = useState<ParsedMusicCell | null>(null);
  const [voiceControls, setVoiceControls] = useState<Record<string, VoiceControl>>({});
  const [showMixer, setShowMixer] = useState(false);
  const activeNodesRef = useRef<Record<string, ActiveNode>>({});

  const handleChange = (val: string) => {
    onChange({ ...cell, source: val.split("\n") });
  };

  // Parse content whenever it changes to update controls
  useEffect(() => {
    try {
      const data = parseMusicCell(content.split("\n"));
      setLastParsedData(data);

      setVoiceControls((prev) => {
        const next = { ...prev };
        let hasChanges = false;

        // Sync voices
        Object.keys(data.voices).forEach((v) => {
          if (!next[v]) {
            next[v] = { volume: -5, muted: false, instrument: "harmonium" };
            hasChanges = true;
          }
        });

        // Sync Tala
        if (data.directives.tala && !next["__tala"]) {
          next["__tala"] = { 
            volume: -5, 
            muted: false, 
            instrument: data.directives.tala_pattern ? "tabla-sampler" : "tabla" 
          };
          hasChanges = true;
        }

        return hasChanges ? next : prev;
      });
    } catch (e) {
      // silent fail on type; waiting for valid input
    }
  }, [content]);

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
      await playMusic(data, voiceControls);
      setIsPlaying(true);
    } catch (e) {
      console.error(e);
      toast.error("Could not parse musical notation");
    }
  };

  const stopPlayback = () => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    Object.values(activeNodesRef.current).forEach(({ synth, volumeNode }) => {
      try {
        // Handle tabla-sampler type
        if (synth && typeof synth === 'object' && 'type' in synth && synth.type === 'tabla-sampler' && 'players' in synth) {
          const tablaSampler = synth as { type: 'tabla-sampler'; players: Record<string, Tone.Player> };
          Object.values(tablaSampler.players).forEach((player) => {
            try {
              player.stop();
              player.dispose();
            } catch (e) {
              /* ignore */
            }
          });
        } else if (synth && typeof synth === 'object' && 'releaseAll' in synth) {
          (synth as Tone.Sampler | Tone.PolySynth).releaseAll?.();
          (synth as Tone.Sampler | Tone.PolySynth).dispose?.();
        } else if (synth && typeof synth === 'object' && 'dispose' in synth) {
          (synth as Tone.MembraneSynth).dispose?.();
        }
        volumeNode?.dispose();
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
      if (nodes && nodes.volumeNode) {
        nodes.volumeNode.mute = control.muted;
        nodes.volumeNode.volume.rampTo(control.volume, 0.1);
      }
    });
  }, [voiceControls]);

  const updateVoiceControl = (voiceName: string, updates: Partial<VoiceControl>) => {
    setVoiceControls((prev) => ({
      ...prev,
      [voiceName]: { ...prev[voiceName], ...updates },
    }));
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
      else normalizedSwara = swara[0];
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

  const playMusic = async (parsedData: ParsedMusicCell, currentControls: Record<string, VoiceControl>) => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    Object.values(activeNodesRef.current).forEach(({ synth, volumeNode }) => {
      try {
        // Handle tabla-sampler type
        if (synth && synth.type === 'tabla-sampler' && synth.players) {
          Object.values(synth.players).forEach((player) => {
            try {
              player.stop();
              player.dispose();
            } catch (e) {
              /* ignore */
            }
          });
        } else {
          synth.dispose?.();
        }
        volumeNode?.dispose();
      } catch (e) {
        /* ignore */
      }
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
        // Parse and play tabla pattern using samples
        const pattern = parsedData.directives.tala_pattern.trim();
        const tablaInstrument = await createInstrument("tabla-sampler");
        
        if (tablaInstrument && tablaInstrument.type === 'tabla-sampler' && tablaInstrument.players) {
          tablaInstrument.players = Object.fromEntries(
            Object.entries(tablaInstrument.players).map(([bol, player]) => [
              bol,
              player.connect(talaVol)
            ])
          );
          
          activeNodesRef.current["__tala"] = {
            synth: tablaInstrument,
            volumeNode: talaVol,
          };

          // Parse the pattern: split by spaces, handle durations and bars
          const parseTalaPattern = (patternStr, defaultDur, beatDurSeconds) => {
            const events = [];
            // Remove comments
            const cleanPattern = patternStr.split('#')[0].trim();
            // Split by spaces, but preserve bars
            const tokens = cleanPattern.split(/\s+/).filter(t => t);
            
            let time = 0; // Time in seconds
            for (const token of tokens) {
              if (token === '|' || token === '||') {
                // Bar marker - just continue, timing stays the same
                continue;
              }
              
              // Parse bol:duration format (e.g., "dha:1" or just "dha")
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
                const durationSeconds = duration * beatDurSeconds;
                events.push({ bol, duration, time });
                time += durationSeconds;
              }
            }
            
            return events;
          };

          const defaultTalaDur = parseFloat(parsedData.directives.default_duration) || 1.0;
          const talaEvents = parseTalaPattern(pattern, defaultTalaDur, beatDur);
          const cycleDuration = talaEvents.length > 0 
            ? talaEvents[talaEvents.length - 1].time + (talaEvents[talaEvents.length - 1].duration * beatDur)
            : 4 * beatDur; // Default to 4 beats if empty

          // Schedule the pattern to repeat
          Tone.getTransport().scheduleRepeat((time) => {
            talaEvents.forEach((event) => {
              const player = tablaInstrument.players[event.bol];
              if (player) {
                player.start(time + event.time);
              }
            });
          }, cycleDuration);
        }
      } else {
        // Fallback to simple membrane synth beat
        const membrane = await createInstrument(talaCtrl.instrument || "tabla");
        membrane.connect(talaVol);
        activeNodesRef.current["__tala"] = {
          synth: membrane,
          volumeNode: talaVol,
        };

        // Schedule simpler beat for now
        Tone.getTransport().scheduleRepeat((time) => {
          membrane.triggerAttackRelease("C2", "8n", time);
        }, "4n");
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

    const scales = {
      S: 0,
      r: 1,
      R: 2,
      g: 3,
      G: 4,
      m: 5,
      M: 6,
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
        instrument: "harmonium",
      };
      const volumeNode = new Tone.Volume(volControl.volume).toDestination();
      volumeNode.mute = volControl.muted;

      const synth = await createInstrument(volControl.instrument || "synth");
      if (isToneInstrument(synth)) {
        synth.connect(volumeNode);
      }
      activeNodesRef.current[voiceName] = { synth, volumeNode };

      let time = 0;

      voice.events.forEach((event) => {
        if ('duration' in event && event.duration) {
          const durSeconds = event.duration * beatDur;
          if (event.type === "note" && 'swara' in event && event.swara) {
            // Calculate start frequency
            const startFreq = swaraToFrequency(
              event.swara,
              event.variant,
              event.octave,
              SA_FREQ,
              scales
            );

            // Check for meend ornament
            const meendOrnament = event.ornaments?.find(
              (o) => o.name === "meend" || o.name === "slide"
            );

            if (meendOrnament && meendOrnament.params.length > 0) {
              // Parse target swara (first parameter)
              const targetSwaraStr = meendOrnament.params[0];

              // Parse target swara - extract swara name, variant, and octave
              // Use the same logic as the parser would use
              let targetSwara = targetSwaraStr.trim();
              let targetVariant = undefined;
              let targetOctave = 0;

              // Normalize swara name (handle multi-character names)
              const upper = targetSwara.toUpperCase();
              if (upper.startsWith("SA")) {
                targetSwara = "S";
              } else if (upper.startsWith("RI")) {
                targetSwara = "R";
              } else if (upper.startsWith("GA")) {
                targetSwara = "G";
              } else if (upper.startsWith("MA")) {
                targetSwara = "M";
              } else if (upper.startsWith("PA")) {
                targetSwara = "P";
              } else if (upper.startsWith("DHA")) {
                targetSwara = "D";
              } else if (upper.startsWith("NI")) {
                targetSwara = "N";
              } else {
                // Extract first character and normalize
                const firstChar = targetSwara[0]?.toUpperCase();
                if (
                  firstChar &&
                  ["S", "R", "G", "M", "P", "D", "N"].includes(firstChar)
                ) {
                  targetSwara = firstChar;
                } else {
                  // Fallback to S if parsing fails
                  targetSwara = "S";
                }
              }

              // Check for variant markers (k/b for komal, t/# for tivra)
              if (
                targetSwaraStr.includes("k") ||
                targetSwaraStr.includes("b")
              ) {
                targetVariant = "k";
              } else if (
                targetSwaraStr.includes("t") ||
                targetSwaraStr.includes("#")
              ) {
                targetVariant = "t";
              }

              // Count octave markers
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

              // Determine if instrument supports frequency ramping
              const isSampler = synth instanceof Tone.Sampler;
              const isPolySynth = synth instanceof Tone.PolySynth;

              // For samplers and polysynths, use a temporary synth for meend
              // (they don't support direct frequency ramping)
              const needsTempSynth = isSampler || isPolySynth;

              // Parse duration parameters
              let startDur = 0;
              let slideDur = durSeconds;
              let endDur = 0;
              let isThreePhase = false;

              if (meendOrnament.params.length === 4) {
                // Three-phase meend: [targetSwara, startDur, slideDur, endDur]
                const parsedStart = parseFloat(meendOrnament.params[1]);
                const parsedSlide = parseFloat(meendOrnament.params[2]);
                const parsedEnd = parseFloat(meendOrnament.params[3]);

                if (
                  !isNaN(parsedStart) &&
                  !isNaN(parsedSlide) &&
                  !isNaN(parsedEnd)
                ) {
                  const totalSpecified = parsedStart + parsedSlide + parsedEnd;
                  if (totalSpecified > 0) {
                    // Normalize durations to match note duration
                    const scale = event.duration / totalSpecified;
                    startDur = parsedStart * scale * beatDur;
                    slideDur = parsedSlide * scale * beatDur;
                    endDur = parsedEnd * scale * beatDur;
                    isThreePhase = true;
                  }
                }
              }

              Tone.getTransport().schedule((t) => {
                // Create temporary synth if needed
                const meendSynth = needsTempSynth
                  ? new Tone.Synth().connect(volumeNode)
                  : synth;

                if (isThreePhase) {
                  // Three-phase meend
                  meendSynth.triggerAttack(startFreq, t);

                  // Phase 1: Hold start frequency (already playing)

                  // Phase 2: Slide to target
                  if (slideDur > 0) {
                    if (needsTempSynth) {
                      // For synths that don't support ramping, use step-based approach
                      // Use more steps for smoother transitions
                      const steps = Math.max(20, Math.floor(slideDur * 30)); // At least 30 steps per second
                      const stepDur = slideDur / steps;
                      const freqStep = (targetFreq - startFreq) / steps;

                      // Use overlapping notes for smoother transition
                      for (let i = 1; i <= steps; i++) {
                        const stepTime = t + startDur + i * stepDur;
                        const stepFreq = startFreq + i * freqStep;
                        // Release previous note slightly before starting new one for overlap
                        if (i > 1) {
                          meendSynth.triggerRelease(stepTime - stepDur * 0.1);
                        }
                        meendSynth.triggerAttack(
                          stepFreq,
                          stepTime - stepDur * 0.1
                        );
                      }
                    } else {
                      // For regular Synth, use frequency ramping
                      meendSynth.frequency.rampTo(
                        targetFreq,
                        slideDur,
                        t + startDur
                      );
                    }
                  }

                  // Phase 3: Hold target frequency (already at target from slide)

                  // Release
                  meendSynth.triggerRelease(t + startDur + slideDur + endDur);
                } else {
                  // Simple meend: slide over entire duration
                  meendSynth.triggerAttack(startFreq, t);

                  if (needsTempSynth) {
                    // Step-based approach for instruments without ramping
                    // Use more steps for smoother transitions
                    const steps = Math.max(20, Math.floor(slideDur * 30)); // At least 30 steps per second
                    const stepDur = slideDur / steps;
                    const freqStep = (targetFreq - startFreq) / steps;

                    // Use overlapping notes for smoother transition
                    for (let i = 1; i <= steps; i++) {
                      const stepTime = t + i * stepDur;
                      const stepFreq = startFreq + i * freqStep;
                      // Release previous note slightly before starting new one for overlap
                      if (i > 1) {
                        meendSynth.triggerRelease(stepTime - stepDur * 0.1);
                      }
                      meendSynth.triggerAttack(
                        stepFreq,
                        stepTime - stepDur * 0.1
                      );
                    }
                    meendSynth.triggerRelease(t + slideDur);
                  } else {
                    // For regular Synth, use frequency ramping
                    meendSynth.frequency.rampTo(targetFreq, slideDur, t);
                    meendSynth.triggerRelease(t + slideDur);
                  }
                }
              }, time);
            } else {
              // No meend: play normally
              if (isToneInstrument(synth)) {
                Tone.getTransport().schedule((t) => {
                  synth.triggerAttackRelease(startFreq, durSeconds, t);
                }, time);
              }
            }
          }
          time += durSeconds;
        }
      });
      if (time > maxDuration) maxDuration = time;
    }

    Tone.getTransport().start();
    Tone.getTransport().schedule(() => {
      stopPlayback();
    }, maxDuration + 0.1);
  };

  return (
    <div className="flex flex-col relative max-w-full overflow-hidden">
      <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-muted/10 border-b border-border min-w-0">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <Button
            onClick={handlePlay}
            variant={isPlaying ? "destructive" : "default"}
            size="sm"
            className="rounded-full shrink-0"
          >
            {isPlaying ? (
              <>
                <Square className="w-3 h-3 fill-current shrink-0" />{" "}
                <span className="hidden sm:inline">Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current shrink-0" />{" "}
                <span className="hidden sm:inline">Play</span>
              </>
            )}
          </Button>

          <div className="relative shrink-0">
            <Button
              onClick={() => setShowMixer(!showMixer)}
              variant="ghost"
              size="icon-sm"
              className={cn(
                "rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 touch-manipulation",
                showMixer && "bg-muted text-primary"
              )}
              title="Instrument Mixer"
              aria-label="Toggle mixer"
            >
              <Settings2 className="w-4 h-4" />
            </Button>

            {showMixer && (
              <div className="relative z-[9999] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-[288px] md:w-72 bg-popover border border-border rounded-lg shadow-lg p-3 animate-in fade-in zoom-in-95 duration-200 bg-background flex flex-col max-h-[calc(100vh-6rem)] md:max-h-[calc(100vh-8rem)]">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Mixer
                  </h4>
                  <Button
                    onClick={() => setShowMixer(false)}
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 min-w-[32px] min-h-[32px] touch-manipulation"
                    aria-label="Close mixer"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                  {/* Tala Control */}
                  {lastParsedData?.directives?.tala && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                          <span className="text-xs font-medium">
                            Tala (Rhythm)
                          </span>
                          <select
                            className="text-[10px] h-6 bg-muted/50 border-none rounded px-1 min-w-0"
                            value={
                              voiceControls["__tala"]?.instrument || "tabla"
                            }
                            onChange={(e) =>
                              updateVoiceControl("__tala", {
                                instrument: e.target.value,
                              })
                            }
                          >
                            {Object.values(INSTRUMENTS)
                              .filter((i) => i.category === "rhythm")
                              .map((inst) => (
                                <option key={inst.id} value={inst.id}>
                                  {inst.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <Button
                          onClick={() =>
                            updateVoiceControl("__tala", {
                              muted: !voiceControls["__tala"]?.muted,
                            })
                          }
                          variant="ghost"
                          size="icon-sm"
                          className={cn(
                            voiceControls["__tala"]?.muted && "text-destructive"
                          )}
                        >
                          {voiceControls["__tala"]?.muted ? (
                            <VolumeX className="w-3 h-3" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                      <input
                        type="range"
                        min="-30"
                        max="0"
                        step="1"
                        value={voiceControls["__tala"]?.volume ?? -5}
                        onChange={(e) =>
                          updateVoiceControl("__tala", {
                            volume: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                        disabled={voiceControls["__tala"]?.muted}
                      />
                    </div>
                  )}

                  {/* Voice Controls */}
                  {Object.keys(voiceControls)
                    .filter((k) => k !== "__tala")
                    .map((v) => (
                      <div
                        key={v}
                        className="space-y-1.5 pt-1 border-t border-border/50 first:border-0 first:pt-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                            <span className="text-xs font-medium uppercase truncate">
                              {v}
                            </span>
                            <select
                              className="text-[10px] h-6 bg-muted/50 border-none rounded px-1 min-w-0"
                              value={voiceControls[v]?.instrument || "synth"}
                              onChange={(e) =>
                                updateVoiceControl(v, {
                                  instrument: e.target.value,
                                })
                              }
                            >
                              {Object.values(INSTRUMENTS)
                                .filter((i) => i.category === "melody")
                                .map((inst) => (
                                  <option key={inst.id} value={inst.id}>
                                    {inst.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Button
                              onClick={() =>
                                updateVoiceControl(v, {
                                  muted: !voiceControls[v]?.muted,
                                })
                              }
                              variant="ghost"
                              size="icon-sm"
                              className={cn(
                                voiceControls[v]?.muted && "text-destructive"
                              )}
                            >
                              {voiceControls[v]?.muted ? (
                                <VolumeX className="w-3 h-3" />
                              ) : (
                                <Volume2 className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="0"
                          step="1"
                          value={voiceControls[v]?.volume ?? -5}
                          onChange={(e) =>
                            updateVoiceControl(v, {
                              volume: parseFloat(e.target.value),
                            })
                          }
                          className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                          disabled={voiceControls[v]?.muted}
                        />
                      </div>
                    ))}

                  {Object.keys(voiceControls).length === 0 && (
                    <div className="text-xs text-muted-foreground italic text-center py-2">
                      No instruments detected
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="p-1 overflow-x-auto max-w-full">
        <div className="min-w-0">
          <CodeMirror
            value={content}
            height="auto"
            extensions={[markdown()]}
            onChange={handleChange}
            theme={theme}
            className="text-sm font-mono focus-within:ring-0"
          />
        </div>
      </div>
      {isPlaying && lastParsedData && (
        <div className="px-3 md:px-4 pb-4 overflow-x-auto max-w-full">
          <div className="min-w-0">
            <MusicVisualizer
              parsedData={lastParsedData}
              isPlaying={isPlaying}
            />
          </div>
        </div>
      )}
    </div>
  );
}
