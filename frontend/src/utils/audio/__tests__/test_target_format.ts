import {
  transcribeAudioToSargam,
  TALA_PRESETS,
} from '../sargamTranscriber';
import { noteToFrequency } from '../tonicDetector';

const saD4 = 293.66; // Sa = D4
const sampleRate = 44100;
const bpm = 50;
const beatSec = 60 / bpm; // 1.2s per beat
const subBeatSec = beatSec * 0.5; // 0.6s per 0.5 matra

// Synthesize the exact 16 beats of notes:
// Line 1 (5 beats of notes after /:11):
// G:0.5 G:0.5 R:0.5 ^:0.5 S:0.5 S:0.5 N,:0.5 D,:0.25 D,:0.25 N,:0.5 S:0.5
// Line 2 (11 beats of notes):
// N,:0.5 ^:0.5 N,:0.5 ^:0.5 P,:0.5 ^:0.5 Mt,:0.5 Mt,:0.5 D,:0.5 ^:0.5 N,:0.5 N,:0.5 R:0.5 ^:0.5 P:0.5 Mt:0.5 G:0.5 ^:0.5 R:0.5 ^:0.5 S:0.5 ^:0.5
console.log('Testing complete Sitar Gat synthesis and transcription at 50 BPM...');

const totalNotesDurationSec = (5 + 11) * beatSec; // 19.2s
const buffer = new Float32Array(Math.floor(sampleRate * totalNotesDurationSec));

const fG = noteToFrequency('F#', 4);
const fR = noteToFrequency('E', 4);
const fS = noteToFrequency('D', 4);
const fN_ = noteToFrequency('C#', 4);
const fD_ = noteToFrequency('B', 3);
const fP_ = noteToFrequency('A', 3);
const fMt_ = noteToFrequency('G#', 3);
const fP = noteToFrequency('A', 4);
const fMt = noteToFrequency('G#', 4);

function fillSlot(startSec: number, durSec: number, freq: number, isChikari = false) {
  const startSample = Math.floor(startSec * sampleRate);
  const durSamples = Math.floor(durSec * sampleRate);
  for (let i = 0; i < durSamples && startSample + i < buffer.length; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 2.5);
    if (isChikari) {
      buffer[startSample + i] = 0.5 * decay * Math.sin(2 * Math.PI * 1800 * t) + 0.3 * (Math.random() - 0.5) * decay;
    } else {
      buffer[startSample + i] = 0.7 * decay * Math.sin(2 * Math.PI * freq * t) + 0.3 * decay * Math.sin(2 * Math.PI * freq * 2 * t);
    }
  }
}

let t = 0;
// Line 1:
fillSlot(t, 0.6, fG); t += 0.6;
fillSlot(t, 0.6, fG); t += 0.6;
fillSlot(t, 0.6, fR); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fS); t += 0.6;
fillSlot(t, 0.6, fS); t += 0.6;
fillSlot(t, 0.6, fN_); t += 0.6;
fillSlot(t, 0.3, fD_); t += 0.3;
fillSlot(t, 0.3, fD_); t += 0.3;
fillSlot(t, 0.6, fN_); t += 0.6;
fillSlot(t, 0.6, fS); t += 0.6;

// Line 2:
fillSlot(t, 0.6, fN_); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fN_); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fP_); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fMt_); t += 0.6;
fillSlot(t, 0.6, fMt_); t += 0.6;
fillSlot(t, 0.6, fD_); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fN_); t += 0.6;
fillSlot(t, 0.6, fN_); t += 0.6;
fillSlot(t, 0.6, fR); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fP); t += 0.6;
fillSlot(t, 0.6, fMt); t += 0.6;
fillSlot(t, 0.6, fG); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fR); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;
fillSlot(t, 0.6, fS); t += 0.6;
fillSlot(t, 0.6, 0, true); t += 0.6;

console.log('Synthesized audio length:', t.toFixed(2), 'seconds');

const res = transcribeAudioToSargam(
  buffer,
  sampleRate,
  'D4',
  saD4,
  {
    bpm: 50,
    talaId: 'tintal',
    pickupBeat: 12,
    gridResolution: 0.5,
    initialSilenceSec: 0,
  }
);

console.log('--- OUTPUT ---');
console.log(res.sargamCode);
