import React from 'react';
import PropTypes from 'prop-types';
import {FFT_SIZE, computeSpectrogram} from '../../lib/audio/spectrum.js';
import styles from './spectrogram.css';

const MIN_FREQ = 20;
const DB_MIN = -90;
const DB_MAX = 0;
const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

// dB -> RGB (black -> purple -> pink -> yellow -> white)
const STOPS = [
    [0, [8, 0, 24]],
    [0.3, [90, 20, 140]],
    [0.6, [220, 60, 150]],
    [0.85, [255, 210, 80]],
    [1, [255, 255, 255]]
];
const colorFor = t => {
    t = Math.min(1, Math.max(0, t));
    for (let i = 1; i < STOPS.length; i++) {
        if (t <= STOPS[i][0]) {
            const [t0, c0] = STOPS[i - 1];
            const [t1, c1] = STOPS[i];
            const f = (t - t0) / (t1 - t0);
            return [
                c0[0] + ((c1[0] - c0[0]) * f),
                c0[1] + ((c1[1] - c0[1]) * f),
                c0[2] + ((c1[2] - c0[2]) * f)
            ];
        }
    }
    return STOPS[STOPS.length - 1][1];
};

class Spectrogram extends React.PureComponent {
    constructor (props) {
        super(props);
        this.canvas = null;
        this.setCanvas = c => {
            this.canvas = c;
        };
    }
    componentDidMount () {
        this.draw();
    }
    componentDidUpdate () {
        this.draw();
    }
    draw () {
        const canvas = this.canvas;
        if (!canvas) return;
        const {samples, sampleRate, width, height} = this.props;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(width, height);
        const nyquist = sampleRate / 2;
        const maxFreq = Math.min(20000, nyquist);
        const logMin = Math.log(MIN_FREQ);
        const logRange = Math.log(maxFreq) - logMin;
        const bins = FFT_SIZE / 2;
        const spec = computeSpectrogram(samples, width);

        // Precompute fractional bin per row (log frequency axis, low freq at bottom).
        const rowBin = new Float32Array(height);
        for (let y = 0; y < height; y++) {
            const freq = Math.exp(logMin + (logRange * (1 - (y / (height - 1)))));
            rowBin[y] = Math.min(bins - 1.001, (freq / nyquist) * bins);
        }
        for (let x = 0; x < width; x++) {
            const col = spec[x];
            for (let y = 0; y < height; y++) {
                const b = rowBin[y];
                const i0 = Math.floor(b);
                const f = b - i0;
                const db = (col[i0] * (1 - f)) + (col[i0 + 1] * f);
                const [r, g, bl] = colorFor((db - DB_MIN) / (DB_MAX - DB_MIN));
                const o = ((y * width) + x) * 4;
                image.data[o] = r;
                image.data[o + 1] = g;
                image.data[o + 2] = bl;
                image.data[o + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);

        // Frequency gridlines + labels
        ctx.font = '10px sans-serif';
        ctx.textBaseline = 'bottom';
        for (const f of GRID_FREQS) {
            if (f > maxFreq || f < MIN_FREQ) continue;
            const y = Math.round((1 - ((Math.log(f) - logMin) / logRange)) * (height - 1)) + 0.5;
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 3, y - 1);
        }
    }
    render () {
        const {width, height} = this.props;
        return (
            <canvas
                className={styles.container}
                ref={this.setCanvas}
                width={width}
                height={height}
            />
        );
    }
}

Spectrogram.propTypes = {
    height: PropTypes.number,
    sampleRate: PropTypes.number,
    samples: PropTypes.instanceOf(Float32Array),
    width: PropTypes.number
};

export default Spectrogram;
