import * as Tone from 'tone';

/**
 * Universal Web Audio Meend Engine for Sample-Based Instruments
 *
 * In real Indian classical string playing, meends are performed by plucking once
 * and pulling the string laterally across the frets to continuously bend pitch.
 *
 * This engine automates Web Audio's native AudioBufferSourceNode.detune AudioParam
 * (linearRampToValueAtTime in cents) on the underlying recorded audio sample.
 * Because detune is in logarithmic cents, a linear detune ramp produces an exact
 * exponential frequency curve, providing fluid, natural microtonal slides on
 * real acoustic instruments without any 30-step re-triggering or stuttering!
 */

export interface PlaySampleMeendOptions {
  sampler: Tone.Sampler;
  startFreq: number;
  targetFreq: number;
  time: number;
  startDur: number;
  slideDur: number;
  endDur: number;
  destinationNode: Tone.ToneAudioNode | AudioNode;
}

export function playSampleMeend({
  sampler,
  startFreq,
  targetFreq,
  time,
  startDur,
  slideDur,
  endDur,
  destinationNode,
}: PlaySampleMeendOptions): boolean {
  try {
    const rawCtx = (Tone.getContext().rawContext as any)._nativeAudioContext || Tone.getContext().rawContext;
    if (!rawCtx) return false;

    // 1. Find closest sample buffer in sampler
    const startMidi = Tone.Frequency(startFreq).toMidi();
    const roundMidi = Math.round(startMidi);
    const diff = (sampler as any)._findClosest ? (sampler as any)._findClosest(roundMidi) : 0;
    const closestMidi = roundMidi - diff;

    const toneBuffer = (sampler as any)._buffers?.get(closestMidi);
    if (!toneBuffer || !toneBuffer.loaded) {
      // If buffer not ready, fall back to default trigger
      sampler.triggerAttackRelease(startFreq, startDur + slideDur + endDur, time);
      return true;
    }

    const audioBuffer: AudioBuffer = toneBuffer.get();
    if (!audioBuffer) return false;

    // 2. Calculate base playbackRate for startFreq relative to the sample root
    const sampleFreq = Tone.Frequency(closestMidi, 'midi').toFrequency();
    const baseRate = startFreq / sampleFreq;

    // 3. Calculate pitch delta in cents (100 cents = 1 semitone)
    const deltaCents = 1200 * Math.log2(targetFreq / startFreq);

    // 4. Create native AudioBufferSourceNode
    const source = rawCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.setValueAtTime(baseRate, time);

    // 5. Create click-free envelope gain
    const totalDuration = startDur + slideDur + endDur;
    const gainNode = rawCtx.createGain();

    // Click-free 6ms attack fade-in
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(1, time + 0.006);

    // 6. Schedule detune meend ramp
    source.detune.setValueAtTime(0, time);
    if (startDur > 0) {
      source.detune.setValueAtTime(0, time + startDur);
    }
    if (slideDur > 0) {
      source.detune.linearRampToValueAtTime(deltaCents, time + startDur + slideDur);
    }
    if (endDur > 0) {
      source.detune.setValueAtTime(deltaCents, time + startDur + slideDur + endDur);
    }

    // Click-free release fade-out at end of duration
    const releaseDur = Math.min(0.08, totalDuration * 0.25);
    const releaseStart = time + totalDuration - releaseDur;
    gainNode.gain.setValueAtTime(1, releaseStart);
    gainNode.gain.linearRampToValueAtTime(0, time + totalDuration);

    // 7. Route and start
    source.connect(gainNode);
    if (destinationNode instanceof Tone.ToneAudioNode) {
      gainNode.connect(destinationNode.input as AudioNode);
    } else {
      gainNode.connect(destinationNode);
    }

    source.start(time);
    source.stop(time + totalDuration + 0.06);

    return true;
  } catch (err) {
    console.warn('[playSampleMeend] Fallback due to error:', err);
    sampler.triggerAttackRelease(startFreq, startDur + slideDur + endDur, time);
    return false;
  }
}

export function playSampleKan(
  sampler: Tone.Sampler,
  mainFreq: number,
  kanFreq: number,
  time: number,
  duration: number,
  destinationNode: Tone.ToneAudioNode | AudioNode
): boolean {
  const kanGlideTime = Math.min(0.045, duration * 0.25);
  return playSampleMeend({
    sampler,
    startFreq: kanFreq,
    targetFreq: mainFreq,
    time,
    startDur: 0,
    slideDur: kanGlideTime,
    endDur: Math.max(0.05, duration - kanGlideTime),
    destinationNode,
  });
}
