import React, { useState, useRef, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import * as Tone from 'tone';
import { toast } from 'sonner';
import { Play, Square, Volume2, VolumeX, Settings2 } from "lucide-react";
import { cn } from '../lib/utils';
import { parseMusicCell } from '../utils/sargam_parser';
import { MusicVisualizer } from './MusicVisualizer';
import { createInstrument, INSTRUMENTS } from '../lib/instruments';

export function MusicCell({ cell, onChange, theme }) {
    const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;
    const [isPlaying, setIsPlaying] = useState(false);
    const [lastParsedData, setLastParsedData] = useState(null);
    const [voiceControls, setVoiceControls] = useState({});
    const [showMixer, setShowMixer] = useState(false);
    const activeNodesRef = useRef({});

    const handleChange = (val) => {
        onChange({ ...cell, source: val.split('\n') });
    };

    // Parse content whenever it changes to update controls
    useEffect(() => {
        try {
            const data = parseMusicCell(content.split('\n'));
            setLastParsedData(data);

            setVoiceControls(prev => {
                const next = { ...prev };
                let hasChanges = false;

                // Sync voices
                Object.keys(data.voices).forEach(v => {
                    if (!next[v]) {
                        next[v] = { volume: -5, muted: false, instrument: 'harmonium' };
                        hasChanges = true;
                    }
                });

                // Sync Tala
                if (data.directives.tala && !next['__tala']) {
                    next['__tala'] = { volume: -5, muted: false, instrument: 'tabla' };
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
            const data = parseMusicCell(content.split('\n'));
            setLastParsedData(data);
            await playMusic(data, voiceControls);
            setIsPlaying(true);
        } catch (e) {
            console.error(e);
            toast.error('Could not parse musical notation');
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
            } catch (e) { /* ignore */ }
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
        setVoiceControls(prev => ({
            ...prev,
            [voiceName]: { ...prev[voiceName], ...updates }
        }));
    };

    const playMusic = async (parsedData, currentControls) => {
        Tone.getTransport().stop();
        Tone.getTransport().cancel();

        Object.values(activeNodesRef.current).forEach(({ synth, volumeNode }) => {
            try { synth.dispose(); volumeNode?.dispose(); } catch (e) { }
        });
        activeNodesRef.current = {};

        const bpmRaw = parsedData.directives.tempo || parsedData.directives.bpm || '120';
        const bpm = parseFloat(bpmRaw) || 120;
        Tone.getTransport().bpm.value = bpm;

        let maxDuration = 0;

        // Setup Tala (Membrane Synth)
        if (parsedData.directives.tala) {
            const talaCtrl = currentControls['__tala'] || { volume: -5, muted: false, instrument: 'tabla' };
            const talaVol = new Tone.Volume(talaCtrl.volume).toDestination();
            talaVol.mute = talaCtrl.muted;

            const membrane = await createInstrument(talaCtrl.instrument || 'tabla');
            membrane.connect(talaVol);
            activeNodesRef.current['__tala'] = { synth: membrane, volumeNode: talaVol };

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
            } catch (e) { console.warn("Invalid tonic:", tonicSpec); }
        }

        const scales = {
            'S': 0, 'r': 1, 'R': 2, 'g': 3, 'G': 4, 'm': 5, 'M': 6, 'P': 7, 'd': 8, 'D': 9, 'n': 10, 'N': 11
        };

        for (const [voiceName, voice] of Object.entries(parsedData.voices)) {
            const volControl = currentControls[voiceName] || { volume: -5, muted: false, instrument: 'harmonium' };
            const volumeNode = new Tone.Volume(volControl.volume).toDestination();
            volumeNode.mute = volControl.muted;

            const synth = await createInstrument(volControl.instrument || 'synth');
            synth.connect(volumeNode);
            activeNodesRef.current[voiceName] = { synth, volumeNode };

            let time = 0;
            const beatDur = 60 / bpm;

            voice.events.forEach(event => {
                if (event.duration) {
                    const durSeconds = event.duration * beatDur;
                    if (event.type === 'note' && event.swara) {
                        let swara = event.swara;
                        if (swara.length > 1) {
                            if (swara.toUpperCase() === 'SA') swara = 'S';
                            else if (swara.toUpperCase() === 'RI') swara = 'R';
                            else if (swara.toUpperCase() === 'GA') swara = 'G';
                            else if (swara.toUpperCase() === 'MA') swara = 'M';
                            else if (swara.toUpperCase() === 'PA') swara = 'P';
                            else if (swara.toUpperCase() === 'DHA') swara = 'D';
                            else if (swara.toUpperCase() === 'NI') swara = 'N';
                            else swara = swara[0];
                        }

                        let semitones = scales[swara] || 0;
                        if (event.variant === 'k' || event.variant === 'b') semitones -= 1;
                        if (event.variant === 't' || event.variant === '#') semitones += 1;
                        semitones += (event.octave || 0) * 12;

                        const freq = SA_FREQ * Math.pow(2, semitones / 12);
                        Tone.getTransport().schedule((t) => {
                            synth.triggerAttackRelease(freq, durSeconds, t);
                        }, time);
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
        <div className="flex flex-col relative">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-b border-border">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handlePlay}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95",
                            isPlaying
                                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                    >
                        {isPlaying ? (
                            <><Square className="w-3 h-3 fill-current" /> Stop</>
                        ) : (
                            <><Play className="w-3 h-3 fill-current" /> Play</>
                        )}
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowMixer(!showMixer)}
                            className={cn(
                                "p-1.5 rounded-full hover:bg-muted transition-colors",
                                showMixer && "bg-muted text-primary"
                            )}
                            title="Instrument Mixer"
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>

                        {showMixer && (
                            <div className="absolute top-8 left-0 z-50 w-72 bg-popover border border-border rounded-lg shadow-lg p-3 animate-in fade-in zoom-in-95 duration-200 bg-background">
                                <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Mixer</h4>
                                <div className="space-y-3">
                                    {/* Tala Control */}
                                    {lastParsedData?.directives?.tala && (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                                                    <span className="text-xs font-medium">Tala (Rhythm)</span>
                                                    <select
                                                        className="text-[10px] h-6 bg-muted/50 border-none rounded px-1 min-w-0"
                                                        value={voiceControls['__tala']?.instrument || 'tabla'}
                                                        onChange={(e) => updateVoiceControl('__tala', { instrument: e.target.value })}
                                                    >
                                                        {Object.values(INSTRUMENTS).filter(i => i.category === 'rhythm').map(inst => (
                                                            <option key={inst.id} value={inst.id}>{inst.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => updateVoiceControl('__tala', { muted: !voiceControls['__tala']?.muted })}
                                                    className={cn("p-1 rounded-sm hover:bg-muted", voiceControls['__tala']?.muted && "text-destructive")}
                                                >
                                                    {voiceControls['__tala']?.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                                                </button>
                                            </div>
                                            <input
                                                type="range"
                                                min="-30"
                                                max="0"
                                                step="1"
                                                value={voiceControls['__tala']?.volume ?? -5}
                                                onChange={(e) => updateVoiceControl('__tala', { volume: parseFloat(e.target.value) })}
                                                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                                disabled={voiceControls['__tala']?.muted}
                                            />
                                        </div>
                                    )}

                                    {/* Voice Controls */}
                                    {Object.keys(voiceControls).filter(k => k !== '__tala').map(v => (
                                        <div key={v} className="space-y-1.5 pt-1 border-t border-border/50 first:border-0 first:pt-0">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                                                    <span className="text-xs font-medium uppercase truncate">{v}</span>
                                                    <select
                                                        className="text-[10px] h-6 bg-muted/50 border-none rounded px-1 min-w-0"
                                                        value={voiceControls[v]?.instrument || 'synth'}
                                                        onChange={(e) => updateVoiceControl(v, { instrument: e.target.value })}
                                                    >
                                                        {Object.values(INSTRUMENTS).filter(i => i.category === 'melody').map(inst => (
                                                            <option key={inst.id} value={inst.id}>{inst.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <button
                                                        onClick={() => updateVoiceControl(v, { muted: !voiceControls[v]?.muted })}
                                                        className={cn("p-1 rounded-sm hover:bg-muted", voiceControls[v]?.muted && "text-destructive")}
                                                    >
                                                        {voiceControls[v]?.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <input
                                                type="range"
                                                min="-30"
                                                max="0"
                                                step="1"
                                                value={voiceControls[v]?.volume ?? -5}
                                                onChange={(e) => updateVoiceControl(v, { volume: parseFloat(e.target.value) })}
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
            <div className="p-1">
                <CodeMirror
                    value={content}
                    height="auto"
                    extensions={[markdown()]}
                    onChange={handleChange}
                    theme={theme}
                    className="text-sm font-mono focus-within:ring-0"
                />
            </div>
            {isPlaying && lastParsedData && (
                <div className="px-4 pb-4">
                    <MusicVisualizer parsedData={lastParsedData} isPlaying={isPlaying} />
                </div>
            )}
        </div>
    );
}
