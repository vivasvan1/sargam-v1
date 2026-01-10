import * as Tone from "tone";

// Publicly available samples from tonejs-instruments and other open sources
// We use a CDN or raw.githubusercontent for demo purposes.
const BASE_URL =
    "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/";

export type InstrumentType =
    | "synth"
    | "sampler"
    | "synth-custom"
    | "synth-membrane"
    | "tabla-sampler";
export type InstrumentCategory = "melody" | "rhythm";

export interface InstrumentConfig {
    id: string;
    name: string;
    type: InstrumentType;
    category: InstrumentCategory;
    samples?: Record<string, string>;
    baseUrl?: string;
    options?: Tone.MembraneSynthOptions | any;
}

export const INSTRUMENTS: Record<string, InstrumentConfig> = {
    synth: {
        id: "synth",
        name: "Synthesizer",
        type: "synth",
        category: "melody",
    },
    harmonium: {
        id: "harmonium",
        name: "Harmonium (Default)",
        type: "sampler",
        category: "melody",
        samples: {
            C3: "harmonium/C3.mp3",
            C4: "harmonium/C4.mp3",
            C5: "harmonium/C5.mp3",
            G3: "harmonium/G3.mp3",
            G4: "harmonium/G4.mp3",
        },
        baseUrl: BASE_URL,
    },
    flute: {
        id: "flute",
        name: "Flute",
        type: "sampler",
        category: "melody",
        samples: {
            A4: "flute/A4.mp3",
            C4: "flute/C4.mp3",
            E4: "flute/E4.mp3",
            A5: "flute/A5.mp3",
            C5: "flute/C5.mp3",
            E5: "flute/E5.mp3",
            A6: "flute/A6.mp3",
            C6: "flute/C6.mp3",
            E6: "flute/E6.mp3",
        },
        baseUrl: BASE_URL,
    },
    piano: {
        id: "piano",
        name: "Piano",
        type: "sampler",
        category: "melody",
        samples: {
            C3: "piano/C3.mp3",
            C4: "piano/C4.mp3",
            C5: "piano/C5.mp3",
            G3: "piano/G3.mp3",
            G4: "piano/G4.mp3",
        },
        baseUrl: BASE_URL,
    },
    guitar: {
        id: "guitar",
        name: "Guitar",
        type: "sampler",
        category: "melody",
        samples: {
            C3: "guitar-acoustic/C3.mp3",
            C4: "guitar-acoustic/C4.mp3",
            G3: "guitar-acoustic/G3.mp3",
        },
        baseUrl: BASE_URL,
    },
    tabla: {
        id: "tabla",
        name: "Tabla",
        type: "synth-membrane",
        category: "rhythm",
        options: {
            pitchDecay: 0.05,
            octaves: 2,
            oscillator: { type: "sine" },
            envelope: {
                attack: 0.001,
                decay: 0.4,
                sustain: 0.01,
                release: 1.4,
                attackCurve: "exponential",
            },
        },
    },
    "tabla-sampler": {
        id: "tabla-sampler",
        name: "Tabla (Samples)",
        type: "tabla-sampler",
        category: "rhythm",
        samples: {
            dha: "tabla-dha.wav",
            dhe: "tabla-dhe.wav",
            dhec: "tabla-dhec.wav",
            dhen: "tabla-dhen.wav",
            dhin: "tabla-dhin.wav",
            dhun: "tabla-dhun.wav",
            ga: "tabla-ga.wav",
            ka: "tabla-ka.wav",
            kat: "tabla-kat.wav",
            na: "tabla-na.wav",
            ne: "tabla-ne.wav",
            re: "tabla-re.wav",
            ta: "tabla-ta.wav",
            tak: "tabla-tak.wav",
            te: "tabla-te.wav",
            tin: "tabla-tin.wav",
            tit: "tabla-tit.wav",
            tun: "tabla-tun.wav",
        },
        baseUrl: "/",
    },
    "sitar-sampler": {
        id: "sitar-sampler",
        name: "Sitar (Samples)",
        type: "sampler",
        category: "melody",
        samples: {
            A1: "A1.mp3",
            A2: "A2.mp3",
            A3: "A3.mp3",
            A4: "A4.mp3",
            A5: "A5.mp3",
            A6: "A6.mp3",
            A7: "A7.mp3",

            B1: "B1.mp3",
            B2: "B2.mp3",
            B3: "B3.mp3",
            B4: "B4.mp3",
            B5: "B5.mp3",
            B6: "B6.mp3",
            B7: "B7.mp3",

            C1: "C1.mp3",
            C2: "C2.mp3",
            C3: "C3.mp3",
            C4: "C4.mp3",
            C5: "C5.mp3",
            C6: "C6.mp3",
            C7: "C7.mp3",

            D1: "D1.mp3",
            D2: "D2.mp3",
            D3: "D3.mp3",
            D4: "D4.mp3",
            D5: "D5.mp3",
            D6: "D6.mp3",
            D7: "D7.mp3",

            E1: "E1.mp3",
            E2: "E2.mp3",
            E3: "E3.mp3",
            E4: "E4.mp3",
            E5: "E5.mp3",
            E6: "E6.mp3",
            E7: "E7.mp3",

            F1: "F1.mp3",
            F2: "F2.mp3",
            F3: "F3.mp3",
            F4: "F4.mp3",
            F5: "F5.mp3",
            F6: "F6.mp3",
            F7: "F7.mp3",

            G1: "G1.mp3",
            G2: "G2.mp3",
            G3: "G3.mp3",
            G4: "G4.mp3",
            G5: "G5.mp3",
            G6: "G6.mp3",
            G7: "G7.mp3",
        },
        baseUrl:
            "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/sitar-mp3/",
    },
};

// Tonal instruments are those that can play specific frequencies/notes
export type TonalInstrument =
    | Tone.Sampler
    | Tone.PolySynth
    | Tone.MembraneSynth;

// Rhythmic instruments (specifically our Tabla sampler) play pre-defined samples by name
export interface RhythmicInstrument {
    type: "tabla-sampler";
    players: Record<string, Tone.Player>;
}

export type Instrument = TonalInstrument | RhythmicInstrument;

export function isRhythmicInstrument(
    instrument: Instrument
): instrument is RhythmicInstrument {
    return (instrument as any).type === "tabla-sampler";
}

export function isTonalInstrument(
    instrument: Instrument
): instrument is TonalInstrument {
    return !isRhythmicInstrument(instrument);
}

export async function createInstrument(
    instrumentId: string
): Promise<Instrument> {
    const config = INSTRUMENTS[instrumentId] || INSTRUMENTS.synth;

    if (config.type === "sampler") {
        return new Promise((resolve) => {
            const sampler = new Tone.Sampler({
                urls: config.samples!,
                baseUrl: config.baseUrl,
                onload: () => {
                    resolve(sampler);
                },
                // If loading fails or takes too long, we might want to handle it,
                // but Tone.Sampler handles missing files gracefully usually.
            }).toDestination();
        });
    } else if (config.type === "tabla-sampler") {
        // For tabla sampler, we use a Player for each sample since they're not pitched
        // We'll return a special object that can play tabla bols
        return new Promise((resolve) => {
            const players: Record<string, Tone.Player> = {};
            let loadedCount = 0;
            const totalSamples = Object.keys(config.samples!).length;

            Object.entries(config.samples!).forEach(([bol, url]) => {
                const player = new Tone.Player({
                    url: config.baseUrl! + url,
                    onload: () => {
                        loadedCount++;
                        if (loadedCount === totalSamples) {
                            resolve({ type: "tabla-sampler", players });
                        }
                    },
                    onerror: () => {
                        console.warn(`Failed to load tabla sample: ${bol}`);
                        loadedCount++;
                        if (loadedCount === totalSamples) {
                            resolve({ type: "tabla-sampler", players });
                        }
                    },
                }).toDestination();
                players[bol] = player;
            });

            // If no samples, resolve immediately
            if (totalSamples === 0) {
                resolve({ type: "tabla-sampler", players: {} });
            }
        });
    } else if (config.type === "synth-custom") {
        const synth = new Tone.PolySynth(
            Tone.Synth,
            config.options
        ).toDestination();
        return Promise.resolve(synth);
    } else if (config.type === "synth-membrane") {
        const synth = new Tone.MembraneSynth(config.options).toDestination();
        return Promise.resolve(synth);
    } else {
        // Default Synth
        const synth = new Tone.PolySynth(Tone.Synth).toDestination();
        return Promise.resolve(synth);
    }
}
