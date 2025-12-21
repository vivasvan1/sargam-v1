import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import * as Tone from 'tone';
import { toast } from 'sonner';
import { Play, Square } from "lucide-react";
import { cn } from '../lib/utils';
import { parseMusicCell } from '../utils/sargam_parser';
import { MusicVisualizer } from './MusicVisualizer';

export function MusicCell({ cell, onChange, theme }) {
    const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;
    const [isPlaying, setIsPlaying] = useState(false);
    const [parsedData, setParsedData] = useState(null);

    const handleChange = (val) => {
        onChange({ ...cell, source: val.split('\n') });
    };

    const handlePlay = async () => {
        if (isPlaying) {
            Tone.getTransport().stop();
            Tone.getTransport().cancel();
            setIsPlaying(false);
            return;
        }

        await Tone.start();

        try {
            const data = parseMusicCell(content.split('\n'));
            setParsedData(data);
            playMusic(data);
            setIsPlaying(true);
        } catch (e) {
            console.error(e);
            toast.error('Could not parse musical notation');
        }
    };

    const playMusic = (parsedData) => {
        Tone.getTransport().stop();
        Tone.getTransport().cancel();

        const synth = new Tone.PolySynth(Tone.Synth).toDestination();
        const membrane = new Tone.MembraneSynth().toDestination();

        let SA_FREQ = 261.63;
        const directives = parsedData.directives || {};
        const tonicSpec = directives.sa || directives.tonic;

        if (tonicSpec) {
            try {
                const freq = Tone.Frequency(tonicSpec).toFrequency();
                if (!isNaN(freq) && freq > 0) SA_FREQ = freq;
            } catch (e) {
                console.warn("Invalid tonic:", tonicSpec);
            }
        }

        const scales = {
            'S': 0, 'r': 1, 'R': 2, 'g': 3, 'G': 4, 'm': 5, 'M': 6, 'P': 7, 'd': 8, 'D': 9, 'n': 10, 'N': 11
        };

        const bpm = directives.tempo ? parseFloat(directives.tempo) : 120;
        Tone.getTransport().bpm.value = bpm;

        let maxDuration = 0;
        if (directives.tala) {
            Tone.getTransport().scheduleRepeat((time) => {
                membrane.triggerAttackRelease("C2", "8n", time);
            }, "4n");
        }

        Object.values(parsedData.voices).forEach(voice => {
            let time = 0;
            const beatDur = 60 / bpm;

            voice.events.forEach(event => {
                if (event.duration) {
                    const durSeconds = event.duration * beatDur;
                    if (event.type === 'note' && event.swara) {
                        let semitones = scales[event.swara] || 0;
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
        });

        Tone.getTransport().start();
        Tone.getTransport().schedule((time) => {
            Tone.getTransport().stop();
            setIsPlaying(false);
        }, maxDuration + 0.1);
    };

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-b border-border">
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
            {isPlaying && parsedData && (
                <div className="px-4 pb-4">
                    <MusicVisualizer parsedData={parsedData} isPlaying={isPlaying} />
                </div>
            )}
        </div>
    );
}
