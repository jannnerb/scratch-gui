import React from 'react';
import PropTypes from 'prop-types';
import styles from './detailed-waveform.css';

const PEAK_COLOR = 'hsl(300, 54%, 72%)';
const RMS_COLOR = 'hsl(300, 60%, 50%)';
const EDGE_COLOR = 'hsl(300, 54%, 45%)';
const GRID_COLOR = 'rgba(128, 128, 128, 0.35)';
const LABEL_COLOR = 'rgba(128, 128, 128, 0.95)';
const CLIP_COLOR = '#ff3b3b';
const CLIP_LEVEL = 0.999;

// [amplitude, label]
const GRID = [
    [1, '0 dB'],
    [0.5, '-6 dB'],
    [0.25, '-12 dB']
];

class DetailedWaveform extends React.PureComponent {
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
        const {samples, width, height} = this.props;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        const mid = height / 2;
        const half = (height / 2) - 1;
        const y = v => mid - (v * half);

        // Gridlines (drawn first, under the waveform)
        ctx.lineWidth = 1;
        ctx.font = `${Math.round(height / 16)}px sans-serif`;
        ctx.textBaseline = 'bottom';
        for (const [amp, label] of GRID) {
            for (const sign of [1, -1]) {
                const gy = Math.round(y(sign * amp)) + 0.5;
                ctx.strokeStyle = GRID_COLOR;
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(width, gy);
                ctx.stroke();
                if (sign === 1) {
                    ctx.fillStyle = LABEL_COLOR;
                    ctx.fillText(label, 4, gy + (amp === 1 ? 14 : -2));
                }
            }
        }

        const n = samples.length;
        if (n === 0) return;

        if (n <= width) {
            // Fewer samples than pixels: draw the actual sample line.
            ctx.strokeStyle = EDGE_COLOR;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const x = n === 1 ? 0 : (i / (n - 1)) * width;
                if (i === 0) ctx.moveTo(x, y(samples[i]));
                else ctx.lineTo(x, y(samples[i]));
            }
            ctx.stroke();
        } else {
            const perCol = n / width;
            for (let x = 0; x < width; x++) {
                const start = Math.floor(x * perCol);
                const end = Math.max(start + 1, Math.floor((x + 1) * perCol));
                let min = 1;
                let max = -1;
                let sumSq = 0;
                for (let i = start; i < end; i++) {
                    const v = samples[i];
                    if (v < min) min = v;
                    if (v > max) max = v;
                    sumSq += v * v;
                }
                const rms = Math.sqrt(sumSq / (end - start));
                const top = y(max);
                const bottom = y(min);
                // Peak envelope (min..max)
                ctx.fillStyle = PEAK_COLOR;
                ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
                // RMS body, symmetric around zero, clamped inside peaks
                const rTop = y(Math.min(rms, max));
                const rBottom = y(Math.max(-rms, min));
                ctx.fillStyle = RMS_COLOR;
                ctx.fillRect(x, rTop, 1, Math.max(1, rBottom - rTop));
                // Edge pixels so thin/quiet parts stay visible
                ctx.fillStyle = EDGE_COLOR;
                ctx.fillRect(x, top, 1, 1);
                ctx.fillRect(x, bottom - 1, 1, 1);
                // Clipping markers
                if (max >= CLIP_LEVEL || min <= -CLIP_LEVEL) {
                    ctx.fillStyle = CLIP_COLOR;
                    if (max >= CLIP_LEVEL) ctx.fillRect(x, 0, 1, 3);
                    if (min <= -CLIP_LEVEL) ctx.fillRect(x, height - 3, 1, 3);
                }
            }
        }

        // Zero line on top
        ctx.strokeStyle = EDGE_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(mid) + 0.5);
        ctx.lineTo(width, Math.round(mid) + 0.5);
        ctx.stroke();
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

DetailedWaveform.propTypes = {
    height: PropTypes.number,
    samples: PropTypes.instanceOf(Float32Array),
    width: PropTypes.number
};

export default DetailedWaveform;
