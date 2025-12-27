import * as Tone from 'tone';

// Publicly available samples from tonejs-instruments and other open sources
// We use a CDN or raw.githubusercontent for demo purposes.
const BASE_URL = "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/";

export const INSTRUMENTS = {
    synth: {
        id: 'synth',
        name: 'Synthesizer',
        type: 'synth',
        category: 'melody'
    },
    harmonium: {
        id: 'harmonium',
        name: 'Harmonium (Default)',
        type: 'sampler',
        category: 'melody',
        samples: {
            'C3': 'harmonium/C3.mp3',
            'C4': 'harmonium/C4.mp3',
            'C5': 'harmonium/C5.mp3',
            'G3': 'harmonium/G3.mp3',
            'G4': 'harmonium/G4.mp3',
        },
        baseUrl: BASE_URL
    },
    flute: {
        id: 'flute',
        name: 'Flute',
        type: 'sampler',
        category: 'melody',
        samples: {
            'A4': 'flute/A4.mp3',
            'C4': 'flute/C4.mp3',
            'E4': 'flute/E4.mp3',
            'A5': 'flute/A5.mp3',
            'C5': 'flute/C5.mp3',
            'E5': 'flute/E5.mp3',
            'A6': 'flute/A6.mp3',
            'C6': 'flute/C6.mp3',
            'E6': 'flute/E6.mp3',
        },
        baseUrl: BASE_URL
    },
    piano: {
        id: 'piano',
        name: 'Piano',
        type: 'sampler',
        category: 'melody',
        samples: {
            'C3': 'piano/C3.mp3',
            'C4': 'piano/C4.mp3',
            'C5': 'piano/C5.mp3',
            'G3': 'piano/G3.mp3',
            'G4': 'piano/G4.mp3',
        },
        baseUrl: BASE_URL
    },
    guitar: {
        id: 'guitar',
        name: 'Guitar',
        type: 'sampler',
        category: 'melody',
        samples: {
            'C3': 'guitar-acoustic/C3.mp3',
            'C4': 'guitar-acoustic/C4.mp3',
            'G3': 'guitar-acoustic/G3.mp3',
        },
        baseUrl: BASE_URL
    },
    tabla: {
        id: 'tabla',
        name: 'Tabla',
        type: 'synth-membrane',
        category: 'rhythm',
        options: {
            pitchDecay: 0.05,
            octaves: 2,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" }
        }
    },
    'tabla-sampler': {
        id: 'tabla-sampler',
        name: 'Tabla (Samples)',
        type: 'tabla-sampler',
        category: 'rhythm',
        samples: {
            'dha': 'tabla-dha.wav',
            'dhe': 'tabla-dhe.wav',
            'dhec': 'tabla-dhec.wav',
            'dhen': 'tabla-dhen.wav',
            'dhin': 'tabla-dhin.wav',
            'dhun': 'tabla-dhun.wav',
            'ga': 'tabla-ga.wav',
            'ka': 'tabla-ka.wav',
            'kat': 'tabla-kat.wav',
            'na': 'tabla-na.wav',
            'ne': 'tabla-ne.wav',
            're': 'tabla-re.wav',
            'ta': 'tabla-ta.wav',
            'tak': 'tabla-tak.wav',
            'te': 'tabla-te.wav',
            'tin': 'tabla-tin.wav',
            'tit': 'tabla-tit.wav',
            'tun': 'tabla-tun.wav',
        },
        baseUrl: '/'
    }
};

export async function createInstrument(instrumentId) {
    const config = INSTRUMENTS[instrumentId] || INSTRUMENTS.synth;

    if (config.type === 'sampler') {
        return new Promise((resolve) => {
            const sampler = new Tone.Sampler({
                urls: config.samples,
                baseUrl: config.baseUrl,
                onload: () => {
                    resolve(sampler);
                },
                // If loading fails or takes too long, we might want to handle it, 
                // but Tone.Sampler handles missing files gracefully usually.
            }).toDestination();
        });
    } else if (config.type === 'tabla-sampler') {
        // For tabla sampler, we use a Player for each sample since they're not pitched
        // We'll return a special object that can play tabla bols
        return new Promise((resolve) => {
            const players = {};
            let loadedCount = 0;
            const totalSamples = Object.keys(config.samples).length;
            
            Object.entries(config.samples).forEach(([bol, url]) => {
                const player = new Tone.Player({
                    url: config.baseUrl + url,
                    onload: () => {
                        loadedCount++;
                        if (loadedCount === totalSamples) {
                            resolve({ type: 'tabla-sampler', players });
                        }
                    },
                    onerror: () => {
                        console.warn(`Failed to load tabla sample: ${bol}`);
                        loadedCount++;
                        if (loadedCount === totalSamples) {
                            resolve({ type: 'tabla-sampler', players });
                        }
                    }
                }).toDestination();
                players[bol] = player;
            });
            
            // If no samples, resolve immediately
            if (totalSamples === 0) {
                resolve({ type: 'tabla-sampler', players: {} });
            }
        });
    } else if (config.type === 'synth-custom') {
        const synth = new Tone.PolySynth(Tone.Synth, config.options).toDestination();
        return Promise.resolve(synth);
    } else if (config.type === 'synth-membrane') {
        const synth = new Tone.MembraneSynth(config.options).toDestination();
        return Promise.resolve(synth);
    } else {
        // Default Synth
        const synth = new Tone.PolySynth(Tone.Synth).toDestination();
        return Promise.resolve(synth);
    }
}
