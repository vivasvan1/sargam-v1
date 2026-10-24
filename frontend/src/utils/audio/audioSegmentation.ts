/**
 * Audio Segmentation and DSP Filtering utilities:
 * - Time slicing of AudioBuffer
 * - Lead melodic bandpass filtering (150Hz - 3500Hz)
 * - Harmonic-Percussive Source Separation (HPSS) to attenuate tabla transients
 * - AudioBuffer to WAV Blob conversion for browser playback
 */

/**
 * Extracts a sub-region [startTime, endTime] from an AudioBuffer.
 */
export function sliceAudioBuffer(
  audioCtx: BaseAudioContext,
  sourceBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const sampleRate = sourceBuffer.sampleRate;
  const clampedStart = Math.max(0, Math.min(startTime, sourceBuffer.duration));
  const clampedEnd = Math.max(clampedStart + 0.1, Math.min(endTime, sourceBuffer.duration));

  const startSample = Math.floor(clampedStart * sampleRate);
  const endSample = Math.floor(clampedEnd * sampleRate);
  const length = Math.max(1, endSample - startSample);

  const slicedBuffer = audioCtx.createBuffer(
    sourceBuffer.numberOfChannels,
    length,
    sampleRate
  );

  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
    const srcData = sourceBuffer.getChannelData(ch);
    const dstData = slicedBuffer.getChannelData(ch);
    dstData.set(srcData.subarray(startSample, endSample));
  }

  return slicedBuffer;
}

/**
 * Applies a 4th-order Butterworth-like bandpass filter (highpass + lowpass)
 * to remove sub-bass rumble (<150Hz) and percussion hiss (>3500Hz).
 */
export async function applyBandpassFilter(
  buffer: AudioBuffer,
  lowCut = 150,
  highCut = 3500
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  // Highpass filter (cuts low rumble / tabla dagga resonance)
  const hpFilter = offlineCtx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = lowCut;
  hpFilter.Q.value = 0.707;

  // Lowpass filter (cuts high cymbal / percussion harmonics)
  const lpFilter = offlineCtx.createBiquadFilter();
  lpFilter.type = 'lowpass';
  lpFilter.frequency.value = highCut;
  lpFilter.Q.value = 0.707;

  source.connect(hpFilter);
  hpFilter.connect(lpFilter);
  lpFilter.connect(offlineCtx.destination);

  source.start(0);
  return await offlineCtx.startRendering();
}

/**
 * Fast Harmonic-Percussive Source Separation (HPSS) to attenuate
 * impulsive percussion transients (tabla bols) while preserving sustained swaras.
 */
export function applyHarmonicSeparation(
  samples: Float32Array,
  sampleRate: number
): Float32Array {
  const N = 1024;
  const H = 256;
  const numFrames = Math.floor((samples.length - N) / H);
  if (numFrames < 4) return samples;

  const numBins = Math.floor(N / 2) + 1;

  // Precompute Hann window
  const window = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }

  // 1. Compute STFT magnitude & phase
  const mag = new Float32Array(numFrames * numBins);
  const phase = new Float32Array(numFrames * numBins);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * H;
    for (let k = 0; k < numBins; k++) {
      let r = 0;
      let im = 0;
      const angleStep = (-2 * Math.PI * k) / N;
      for (let n = 0; n < N; n += 2) {
        const x = samples[offset + n] * window[n];
        const a = angleStep * n;
        r += x * Math.cos(a);
        im += x * Math.sin(a);
      }
      const m = Math.sqrt(r * r + im * im);
      const p = Math.atan2(im, r);
      mag[f * numBins + k] = m;
      phase[f * numBins + k] = p;
    }
  }

  // 2. Harmonic Filtering: Median filter across time frames (horizontal direction)
  // Sustained notes remain stable across time, while percussive strikes are brief spikes.
  const harmonicMag = new Float32Array(numFrames * numBins);
  const timeWindow = 5; // median window across 5 frames
  const halfTW = Math.floor(timeWindow / 2);

  for (let k = 0; k < numBins; k++) {
    for (let f = 0; f < numFrames; f++) {
      const windowVals: number[] = [];
      for (let df = -halfTW; df <= halfTW; df++) {
        const frameIdx = f + df;
        if (frameIdx >= 0 && frameIdx < numFrames) {
          windowVals.push(mag[frameIdx * numBins + k]);
        }
      }
      windowVals.sort((a, b) => a - b);
      harmonicMag[f * numBins + k] = windowVals[Math.floor(windowVals.length / 2)];
    }
  }

  // 3. Inverse STFT with Overlap-Add to reconstruct harmonic audio
  const output = new Float32Array(samples.length);
  const norm = new Float32Array(samples.length);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * H;
    for (let n = 0; n < N; n++) {
      let sampleSum = 0;
      for (let k = 0; k < numBins; k += 2) {
        const m = harmonicMag[f * numBins + k];
        const p = phase[f * numBins + k];
        const angle = (2 * Math.PI * k * n) / N + p;
        sampleSum += m * Math.cos(angle);
      }
      const windowedVal = (sampleSum / numBins) * window[n];
      output[offset + n] += windowedVal;
      norm[offset + n] += window[n] * window[n];
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (norm[i] > 1e-4) {
      output[i] /= norm[i];
    }
  }

  return output;
}

/**
 * Converts an AudioBuffer into a playable WAV Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  let samples: Float32Array;
  if (numChannels === 1) {
    samples = buffer.getChannelData(0);
  } else {
    // Interleave channels
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);
    samples = new Float32Array(ch0.length * 2);
    for (let i = 0; i < ch0.length; i++) {
      samples[i * 2] = ch0[i];
      samples[i * 2 + 1] = ch1[i];
    }
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM audio samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}
