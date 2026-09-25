import { useEffect, useRef, useState } from 'react';
import { clock, songProgress } from '../../lib/profileShapes.js';
import './NowPlaying.css';

// What someone is listening to, as the app shows it on their profile
// (components/social/NowPlaying.jsx there): the cover glowing behind the
// card, a progress bar that moves by itself, and the visualiser in the style
// its person picked. The visualiser is animated, not measured, as in the app.

const hash = (value) => {
  let result = 2166136261;
  for (const character of String(value || '')) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619) >>> 0;
  }
  return result;
};

/** A few colours from a cover, or the accent when the cover cannot be read. */
function useCoverColors(art, fallback = '#4a9eda') {
  const [colors, setColors] = useState([fallback, fallback]);
  useEffect(() => {
    setColors([fallback, fallback]);
    if (!art) return undefined;
    let cancelled = false;
    const image = new Image();
    if (/^https:/.test(art)) image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 12;
        canvas.height = 12;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, 12, 12);
        const pixels = context.getImageData(0, 0, 12, 12).data;
        // The two most colourful of a few samples: covers read as their
        // colours, not as the average grey of them.
        const samples = [];
        for (let index = 0; index < pixels.length; index += 4 * 7) {
          const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          samples.push({ rgb: `rgb(${r}, ${g}, ${b})`, score: (max - min) + max / 4 });
        }
        samples.sort((a, b) => b.score - a.score);
        if (!cancelled && samples.length) setColors([samples[0].rgb, (samples[Math.floor(samples.length / 3)] || samples[0]).rgb]);
      } catch {
        // A cover that will not let itself be read keeps the accent.
      }
    };
    image.src = art;
    return () => { cancelled = true; };
  }, [art, fallback]);
  return colors;
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** The visualiser itself: a canvas that draws a style each frame. */
function Visualizer({ style = 'bars', seed = '', colors = ['#4a9eda', '#a78bfa'], height = 56, className = '', still = false }) {
  const canvas = useRef(null);

  useEffect(() => {
    if (style === 'none' || !canvas.current) return undefined;
    const element = canvas.current;
    let context = null;
    try { context = element.getContext('2d'); } catch { /* no drawing here */ }
    if (!context) return undefined;
    const base = hash(seed);
    const bpm = 90 + (base % 50);
    const phases = Array.from({ length: 64 }, (_, index) => ((hash(`${seed}:${index}`) % 1000) / 1000) * Math.PI * 2);
    let frame = null;
    let running = true;

    const size = () => {
      const ratio = globalThis.devicePixelRatio || 1;
      const width = element.clientWidth || 300;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return width;
    };
    let width = size();

    const gradient = () => {
      const fill = context.createLinearGradient(0, height, width, 0);
      fill.addColorStop(0, colors[0]);
      fill.addColorStop(1, colors[1] || colors[0]);
      return fill;
    };

    const draw = (time) => {
      const t = time / 1000;
      const beat = Math.pow(Math.max(0, Math.cos(Math.PI * 2 * t * (bpm / 60))), 8);
      context.clearRect(0, 0, width, height);
      context.fillStyle = gradient();
      context.strokeStyle = gradient();

      if (style === 'bars') {
        const count = Math.max(12, Math.min(64, Math.floor(width / 7)));
        const gap = 2;
        const barWidth = (width - gap * (count - 1)) / count;
        for (let index = 0; index < count; index += 1) {
          const tilt = 1 - (index / count) * 0.55;
          const wobble = 0.5 + 0.5 * Math.sin(t * (2.1 + (index % 5) * 0.37) + phases[index % 64]);
          const level = Math.min(1, (0.18 + 0.62 * Math.pow(wobble, 1.6) + 0.35 * beat * tilt) * tilt);
          const barHeight = Math.max(2, level * height);
          const x = index * (barWidth + gap);
          const radius = Math.min(barWidth / 2, 3);
          context.beginPath();
          context.roundRect?.(x, height - barHeight, barWidth, barHeight, [radius, radius, 0, 0]) ?? context.rect(x, height - barHeight, barWidth, barHeight);
          context.fill();
        }
      } else if (style === 'wave') {
        for (let layer = 0; layer < 3; layer += 1) {
          context.globalAlpha = 0.25 + layer * 0.25;
          context.beginPath();
          const amplitude = height * (0.18 + 0.1 * layer) * (0.7 + 0.5 * beat);
          for (let x = 0; x <= width; x += 3) {
            const y = height / 2
              + Math.sin(x / (28 + layer * 9) + t * (1.6 + layer * 0.5) + phases[layer]) * amplitude
              * (0.6 + 0.4 * Math.sin(x / 90 + t * 0.7));
            if (x === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.lineWidth = 2 + layer;
          context.stroke();
        }
        context.globalAlpha = 1;
      } else if (style === 'orb') {
        const middleX = width / 2;
        const middleY = height / 2;
        const radius = height * 0.28 * (1 + 0.16 * beat);
        for (let ring = 3; ring >= 1; ring -= 1) {
          context.globalAlpha = 0.12 * ring * (0.6 + 0.4 * beat);
          context.beginPath();
          context.arc(middleX, middleY, radius + ring * (height * 0.08) * (1 + beat * 0.5), 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
        context.beginPath();
        context.arc(middleX, middleY, radius, 0, Math.PI * 2);
        context.fill();
        // Sparks round the orb, one per note-ish.
        for (let index = 0; index < 18; index += 1) {
          const angle = (index / 18) * Math.PI * 2 + t * 0.3;
          const reach = radius + 6 + 10 * (0.5 + 0.5 * Math.sin(t * 3 + phases[index])) * (0.5 + beat);
          context.globalAlpha = 0.6;
          context.fillRect(middleX + Math.cos(angle) * reach - 1, middleY + Math.sin(angle) * reach - 1, 2, 2);
        }
        context.globalAlpha = 1;
      }
    };

    const loop = (time) => {
      if (!running) return;
      if (!document.hidden) draw(time);
      frame = requestAnimationFrame(loop);
    };

    // Paused music (or a system asking for less motion): one frame, held.
    const held = still || reducedMotion();
    if (held) draw(0);
    else frame = requestAnimationFrame(loop);

    // Resizing a canvas wipes it: a held frame is drawn again.
    const onResize = () => {
      width = size();
      if (held) draw(0);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(element);
    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [style, seed, colors, height, still]);

  if (style === 'none') return null;
  return <canvas ref={canvas} className={`visualizer ${className}`} style={{ height }} aria-hidden="true" />;
}

/** A progress bar that moves by itself: 1:25 of 2:47. */
function SongProgress({ listening, colors }) {
  const [, tick] = useState(0);
  const progress = songProgress(listening);
  useEffect(() => {
    if (!listening?.duration) return undefined;
    const timer = setInterval(() => tick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [listening?.duration, listening?.startedAt]);
  if (!progress) return null;
  const share = Math.min(100, (progress.elapsed / progress.duration) * 100);
  return (
    <div className="np__progress" aria-label={`${clock(progress.elapsed)} of ${clock(progress.duration)}`}>
      <span>{clock(progress.elapsed)}</span>
      <div className="np__track">
        <div className="np__fill" style={{ width: `${share}%`, background: `linear-gradient(to right, ${colors[0]}, ${colors[1] || colors[0]})` }} />
      </div>
      <span>{clock(progress.duration)}</span>
    </div>
  );
}

export function NowPlayingCard({ listening, style = 'bars', accent = '#7c3aed' }) {
  const colors = useCoverColors(listening?.art, accent);
  if (!listening) return null;
  return (
    <section className="np" style={{ borderColor: `${colors[0]}66`, boxShadow: `0 0 32px ${colors[0]}33` }} aria-label="Listening to">
      {listening.art && <img src={listening.art} alt="" referrerPolicy="no-referrer" className="np__glow" />}
      <div className="np__shade" />
      <div className="np__body">
        <div className="np__row">
          {listening.art ? (
            <img src={listening.art} alt="" referrerPolicy="no-referrer" className="np__cover" />
          ) : (
            <span className="np__cover" style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }} />
          )}
          <div className="np__text">
            <span className="label">Listening to</span>
            <strong>{listening.title}</strong>
            {listening.artist && <span className="np__artist">{listening.artist}</span>}
            {listening.app && <span className="np__app">on {listening.app}</span>}
          </div>
        </div>
        <SongProgress listening={listening} colors={colors} />
        {style !== 'none' && <Visualizer style={style} seed={listening.title} colors={colors} height={48} />}
      </div>
    </section>
  );
}
