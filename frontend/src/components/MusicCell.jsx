import React, { useState, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import * as Tone from "tone";
import { toast } from "sonner";
import { Play, Square, Volume2, VolumeX, Settings2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { parseMusicCell } from "../utils/sargam_parser";
import { MusicVisualizer } from "./MusicVisualizer";
import { createInstrument, INSTRUMENTS } from "../lib/instruments";

export function MusicCell({ cell, onChange, theme }) {
  const content = Array.isArray(cell.source)
    ? cell.source.join("\n")
    : cell.source;
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastParsedData, setLastParsedData] = useState(null);
  const [voiceControls, setVoiceControls] = useState({});
  const [showMixer, setShowMixer] = useState(false);
  const activeNodesRef = useRef({});

  const handleChange = (val) => {
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
          next["__tala"] = { volume: -5, muted: false, instrument: "tabla" };
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
        synth.releaseAll();
        synth.dispose();
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

  const updateVoiceControl = (voiceName, updates) => {
    setVoiceControls((prev) => ({
      ...prev,
      [voiceName]: { ...prev[voiceName], ...updates },
    }));
  };

  // Helper function to convert swara notation to frequency
  const swaraToFrequency = (swara, variant, octave, SA_FREQ, scales) => {
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

  const playMusic = async (parsedData, currentControls) => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    Object.values(activeNodesRef.current).forEach(({ synth, volumeNode }) => {
      try {
        synth.dispose();
        volumeNode?.dispose();
      } catch (e) {}
    });
    activeNodesRef.current = {};

    const bpmRaw =
      parsedData.directives.tempo || parsedData.directives.bpm || "120";
    const bpm = parseFloat(bpmRaw) || 120;
    Tone.getTransport().bpm.value = bpm;

    let maxDuration = 0;

    // Setup Tala (Membrane Synth)
    if (parsedData.directives.tala) {
      const talaCtrl = currentControls["__tala"] || {
        volume: -5,
        muted: false,
        instrument: "tabla",
      };
      const talaVol = new Tone.Volume(talaCtrl.volume).toDestination();
      talaVol.mute = talaCtrl.muted;

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
      synth.connect(volumeNode);
      activeNodesRef.current[voiceName] = { synth, volumeNode };

      let time = 0;
      const beatDur = 60 / bpm;

      voice.events.forEach((event) => {
        if (event.duration) {
          const durSeconds = event.duration * beatDur;
          if (event.type === "note" && event.swara) {
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
              Tone.getTransport().schedule((t) => {
                synth.triggerAttackRelease(startFreq, durSeconds, t);
              }, time);
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
          <button
            onClick={handlePlay}
            className={cn(
              "flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0",
              isPlaying
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
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
          </button>

          <div className="relative shrink-0">
            <button
              onClick={() => setShowMixer(!showMixer)}
              className={cn(
                "p-1.5 rounded-full hover:bg-muted transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center touch-manipulation",
                showMixer && "bg-muted text-primary"
              )}
              title="Instrument Mixer"
              aria-label="Toggle mixer"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {showMixer && (
              <div className="relative z-[9999]">
                <div className="relative md:absolute md:top-10 md:left-0 z-[9999] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-[288px] md:w-72 bg-popover border border-border rounded-lg shadow-lg p-3 animate-in fade-in zoom-in-95 duration-200 bg-background flex flex-col max-h-[calc(100vh-6rem)] md:max-h-[calc(100vh-8rem)]">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Mixer
                    </h4>
                    <button
                      onClick={() => setShowMixer(false)}
                      className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center touch-manipulation"
                      aria-label="Close mixer"
                    >
                      <X className="w-4 h-4" />
                    </button>
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
                          <button
                            onClick={() =>
                              updateVoiceControl("__tala", {
                                muted: !voiceControls["__tala"]?.muted,
                              })
                            }
                            className={cn(
                              "p-1 rounded-sm hover:bg-muted",
                              voiceControls["__tala"]?.muted &&
                                "text-destructive"
                            )}
                          >
                            {voiceControls["__tala"]?.muted ? (
                              <VolumeX className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                          </button>
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
                              <button
                                onClick={() =>
                                  updateVoiceControl(v, {
                                    muted: !voiceControls[v]?.muted,
                                  })
                                }
                                className={cn(
                                  "p-1 rounded-sm hover:bg-muted",
                                  voiceControls[v]?.muted && "text-destructive"
                                )}
                              >
                                {voiceControls[v]?.muted ? (
                                  <VolumeX className="w-3 h-3" />
                                ) : (
                                  <Volume2 className="w-3 h-3" />
                                )}
                              </button>
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
