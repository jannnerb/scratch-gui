// Small radix-2 FFT + spectrogram helpers for the sound editor.

const FFT_SIZE = 2048;

const hann = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 - (0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

const cosTable = new Float32Array(FFT_SIZE / 2);
const sinTable = new Float32Array(FFT_SIZE / 2);
for (let i = 0; i < FFT_SIZE / 2; i++) {
    cosTable[i] = Math.cos((2 * Math.PI * i) / FFT_SIZE);
    sinTable[i] = Math.sin((2 * Math.PI * i) / FFT_SIZE);
}

const reverse = new Uint16Array(FFT_SIZE);
for (let i = 0, bits = Math.log2(FFT_SIZE); i < FFT_SIZE; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
}

// In-place FFT of length FFT_SIZE.
const fft = (re, im) => {
    for (let i = 0; i < FFT_SIZE; i++) {
        const j = reverse[i];
        if (j > i) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (let size = 2; size <= FFT_SIZE; size <<= 1) {
        const half = size >> 1;
        const step = FFT_SIZE / size;
        for (let start = 0; start < FFT_SIZE; start += size) {
            for (let k = 0, t = 0; k < half; k++, t += step) {
                const a = start + k;
                const b = a + half;
                const tr = (re[b] * cosTable[t]) + (im[b] * sinTable[t]);
                const ti = (im[b] * cosTable[t]) - (re[b] * sinTable[t]);
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
    }
};

/**
 * Compute a spectrogram.
 * @param {Float32Array} samples mono samples
 * @param {number} columns number of time columns (one per canvas pixel)
 * @returns {Float32Array[]} per column, FFT_SIZE/2 magnitudes in dBFS (clamped >= -120)
 */
const computeSpectrogram = (samples, columns) => {
    const bins = FFT_SIZE / 2;
    const out = [];
    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);
    for (let c = 0; c < columns; c++) {
        // Center each window on the column's time position.
        const center = Math.floor(((c + 0.5) / columns) * samples.length);
        const start = center - (FFT_SIZE / 2);
        for (let i = 0; i < FFT_SIZE; i++) {
            const idx = start + i;
            re[i] = (idx >= 0 && idx < samples.length ? samples[idx] : 0) * hann[i];
            im[i] = 0;
        }
        fft(re, im);
        const col = new Float32Array(bins);
        for (let b = 0; b < bins; b++) {
            // Normalize so a full-scale sine reads ~0 dB (Hann coherent gain 0.5).
            const mag = Math.sqrt((re[b] * re[b]) + (im[b] * im[b])) / (FFT_SIZE * 0.25);
            col[b] = Math.max(-120, 20 * Math.log10(mag + 1e-9));
        }
        out.push(col);
    }
    return out;
};

export {FFT_SIZE, computeSpectrogram};
