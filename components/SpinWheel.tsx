"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SpinWheel.module.css";

const DEFAULT_NAMES = [
  "Stephen",
  "Lander",
  "Ken",
  "Giyo",
  "Andrey",
  "Randy",
  "Aubrey",
  "Aya",
  "Anne",
  "Mildred",
  "Keilly",
  "Mhy",
  "Dhana",
  "8 M",
];

const RED = "#ef0000";
const BLACK = "#000000";
const WHITE = "#ffffff";
const GREY_COOL = "#a3bbbd";

const SPIN_MS = 10000;
const MIN_EXTRA_TURNS = 6;
const MAX_EXTRA_TURNS = 9;

type Segment = {
  name: string;
  startAngle: number; // degrees, clockwise from top (12 o'clock)
  endAngle: number;
  fill: string;
  textColor: string;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
) {
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
}

function buildSegments(names: string[]): Segment[] {
  const step = 360 / names.length;

  return names.map((name, i) => {
    const startAngle = i * step;
    const endAngle = startAngle + step;
    const isRed = i % 2 === 0;

    return {
      name,
      startAngle,
      endAngle,
      fill: isRed ? RED : GREY_COOL,
      textColor: isRed ? WHITE : BLACK,
    };
  });
}

function parseNames(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const CONFETTI_COLORS = [RED, WHITE, BLACK, GREY_COOL, "#bdccd4"];
const CONFETTI_COUNT = 140;

type ConfettiPiece = {
  id: number;
  left: number; // %
  size: number; // px
  color: string;
  delay: number; // s
  duration: number; // s
  rotate: number; // deg, starting rotation
  spin: number; // deg, total rotation over the fall
  drift: number; // px, horizontal drift by the end
  round: boolean;
};

function generateConfetti(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: 6 + Math.random() * 7,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 2.8,
    duration: 4.4 + Math.random() * 1.6,
    rotate: Math.random() * 360,
    spin: 360 + Math.random() * 540,
    drift: (Math.random() - 0.5) * 160,
    round: Math.random() > 0.5,
  }));
}

function ConfettiLayer({ pieces }: { pieces: ConfettiPiece[] }) {
  return (
    <div
      className={styles.confettiLayer}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className={styles.confettiPiece}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : p.size * 0.42,
              backgroundColor: p.color,
              borderRadius: p.round ? "50%" : "2px",
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotate}deg)`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ---------------- Sound engine ---------------- */
// Reads the wheel's live rotation off the DOM each animation frame and
// fires a short synthesized click whenever a segment boundary is crossed.
// No audio files needed — everything is generated with the Web Audio API.

function getCurrentRotationDeg(el: Element): number {
  const style = window.getComputedStyle(el);
  const transform = style.transform;
  if (!transform || transform === "none") return 0;
  const match = transform.match(/^matrix\(([^)]+)\)$/);
  if (!match) return 0;
  const [a, b] = match[1].split(",").map((v) => parseFloat(v));
  let angle = Math.atan2(b, a) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

function playTick(ctx: AudioContext, intensity: number) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  const freq = 850 + Math.random() * 250;
  osc.frequency.setValueAtTime(freq, now);

  const peak = 0.12 + intensity * 0.18;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

function playWinChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [660, 990].forEach((freq, i) => {
    const start = now + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.42);
  });
}

export default function SpinWheel() {
  const [namesInput, setNamesInput] = useState(DEFAULT_NAMES.join("\n"));
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [removeOnWin, setRemoveOnWin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingWinnerRef = useRef<string | null>(null);
  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickSegmentRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);

  const names = useMemo(() => parseNames(namesInput), [namesInput]);
  const segments = useMemo(
    () => (names.length >= 2 ? buildSegments(names) : []),
    [names],
  );
  const cx = 200;
  const cy = 200;
  const r = 196;
  const fontSize = names.length > 16 ? 6 : names.length > 10 ? 12 : 14;

  function ensureAudio(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtor();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  // Drives the tick sound: while spinning, sample the wheel's actual
  // rendered rotation every animation frame and click whenever the
  // pointer crosses into a new segment. This stays perfectly in sync
  // with the CSS transition's easing (fast at first, sparse at the end)
  // without needing to duplicate the easing curve in JS.
  useEffect(() => {
    if (!spinning) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }

    const ctx = audioCtxRef.current;
    const step = 360 / Math.max(names.length, 1);
    lastTickSegmentRef.current = -1;

    function loop() {
      const el = wheelSvgRef.current;
      if (el && ctx) {
        const angle = getCurrentRotationDeg(el);
        const idx = Math.floor(angle / step);
        if (lastTickSegmentRef.current === -1) {
          lastTickSegmentRef.current = idx;
        } else if (idx !== lastTickSegmentRef.current) {
          lastTickSegmentRef.current = idx;
          playTick(ctx, Math.min(1, names.length / 40));
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [spinning, names.length]);

  function handleSpin() {
    if (spinning) return;
    if (names.length < 2) {
      setError("Add at least two names to spin the wheel.");
      return;
    }
    setError(null);
    setWinner(null);

    // Must be created/resumed inside a user gesture (this click) or
    // browsers will block audio playback.
    ensureAudio();

    const targetIndex = Math.floor(Math.random() * names.length);
    const step = 360 / names.length;
    const segmentCenter = targetIndex * step + step / 2;
    const jitter = (Math.random() - 0.5) * (step * 0.7);
    const desiredMod = (360 - segmentCenter - jitter + 360) % 360;

    const currentMod = ((rotation % 360) + 360) % 360;
    const base = rotation - currentMod; // last full-turn floor
    const extraTurns =
      MIN_EXTRA_TURNS +
      Math.floor(Math.random() * (MAX_EXTRA_TURNS - MIN_EXTRA_TURNS + 1));
    const finalRotation = base + 360 * extraTurns + desiredMod;

    pendingWinnerRef.current = names[targetIndex];
    setSpinning(true);
    setRotation(finalRotation);
  }

  function handleTransitionEnd() {
    if (!spinning) return;
    setSpinning(false);
    const won = pendingWinnerRef.current;
    setWinner(won);
    setConfetti(generateConfetti());

    const ctx = audioCtxRef.current;
    if (ctx) playWinChime(ctx);

    if (removeOnWin && won) {
      const remaining = [...names];
      const idx = remaining.indexOf(won);
      if (idx !== -1) remaining.splice(idx, 1);
      setNamesInput(remaining.join("\n"));
    }
  }

  function handleReset() {
    setNamesInput(DEFAULT_NAMES.join("\n"));
    setWinner(null);
    setError(null);
  }

  function handleRespin() {
    setWinner(null);
    handleSpin();
  }

  function handleShuffle() {
    const shuffled = [...names];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setNamesInput(shuffled.join("\n"));
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        {/* <p className={styles.eyebrow}>Draw a winner</p> */}
        <h1 className={styles.title}>
          Wheel of <span>Names</span>
        </h1>
        {/* <p className={styles.subtitle}>
          Add your names on the right, then spin the wheel to pick one at
          random.
        </p> */}
      </div>

      <div className={styles.layout}>
        {/* Wheel ticket */}
        <section className={styles.ticket}>
          {/* <span className={styles.ticketNotchLeft} aria-hidden="true" />
          <span className={styles.ticketNotchRight} aria-hidden="true" /> */}
          <div className={styles.wheelPanel}>
            <div className={styles.wheelStage}>
              <svg
                className={styles.pointer}
                viewBox="0 0 34 40"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M17 40 L2 12 A17 17 0 1 1 32 12 Z"
                  fill={RED}
                  stroke={WHITE}
                  strokeWidth="2.5"
                />
              </svg>

              {/* Animated circular border */}
              <div className={styles.wheelBorder}>
                {segments.length > 0 ? (
                  <svg
                    ref={wheelSvgRef}
                    className={styles.wheelSvg}
                    viewBox="0 0 400 400"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      transition: spinning
                        ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.18, 1)`
                        : "none",
                    }}
                    onTransitionEnd={handleTransitionEnd}
                  >
                    <circle cx={cx} cy={cy} r={r} fill={RED} />

                    {segments.map((seg, i) => (
                      <path
                        key={i}
                        d={arcPath(cx, cy, r, seg.startAngle, seg.endAngle)}
                        fill={seg.fill}
                        stroke={WHITE}
                        strokeWidth="1.5"
                      />
                    ))}

                    {segments.map((seg, i) => {
                      const centerAngle = (seg.startAngle + seg.endAngle) / 2;
                      const groupRotate = centerAngle - 90;
                      const label =
                        seg.name.length > 16
                          ? seg.name.slice(0, 15) + "…"
                          : seg.name;

                      return (
                        <g
                          key={i}
                          transform={`rotate(${groupRotate} ${cx} ${cy})`}
                        >
                          <text
                            x={cx + r - 12}
                            y={cy + 2}
                            textAnchor="end"
                            fontSize={fontSize}
                            fontWeight={600}
                            fill={seg.textColor}
                            className={styles.segmentText}
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    <circle
                      cx={cx}
                      cy={cy}
                      r={26}
                      fill={WHITE}
                      stroke={RED}
                      strokeWidth="4"
                    />
                  </svg>
                ) : (
                  <svg className={styles.wheelSvg} viewBox="0 0 400 400">
                    <circle cx={cx} cy={cy} r={r} fill={RED} opacity={0.12} />
                  </svg>
                )}
              </div>

              <button
                type="button"
                className={styles.hub}
                onClick={handleSpin}
                disabled={spinning || names.length < 2}
              >
                {spinning ? "…" : "Spin"}
              </button>
            </div>

            {error && <p className={styles.errorText}>{error}</p>}

            {winner && (
              <div className={styles.winnerOverlay}>
                <ConfettiLayer pieces={confetti} />
                <div
                  className={styles.winnerBanner}
                  style={{ position: "relative", zIndex: 2 }}
                >
                  <div className="border-2 border-white rounded-2xl p-10">
                    <div className="flex justify-center items-center gap-8">
                      <div className="w-full h-0.5 bg-white" />
                      <p className={styles.winnerLabel}>Winner</p>
                      <div className="w-full h-0.5 bg-white" />
                    </div>
                    <p className={styles.winnerName}>{winner}</p>

                    <div className={styles.winnerActions}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={handleRespin}
                        disabled={names.length < 2}
                      >
                        Spin again
                      </button>

                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => setWinner(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Entries ticket */}
        <section className={styles.ticket}>
          {/* <span className={styles.ticketNotchLeft} aria-hidden="true" />
          <span className={styles.ticketNotchRight} aria-hidden="true" /> */}
          <div className="flex w-full justify-center items-center">
            <h2 className={styles.entriesTitle}>Entries</h2>
          </div>
          <div className={styles.entriesPanel}>
            <p className={styles.entriesHelp}>
              One name per line.
              <br />
              Duplicates may get extra chances.
            </p>

            <div className={styles.entriesListWrap}>
              <span className={styles.entriesCountBadge}>{names.length}</span>
              <textarea
                className={styles.textarea}
                value={namesInput}
                onChange={(e) => setNamesInput(e.target.value)}
                spellCheck={false}
                placeholder={"Juan\nMaria\nPedro"}
              />
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={removeOnWin}
                onChange={(e) => setRemoveOnWin(e.target.checked)}
              />
              Remove winner after each spin
            </label>

            <button
              type="button"
              className={styles.shuffleBtn}
              onClick={handleShuffle}
              disabled={names.length < 2}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 3h5v5" />
                <path d="M4 20 21 3" />
                <path d="M21 16v5h-5" />
                <path d="M15 15l6 6" />
                <path d="M4 4l5 5" />
              </svg>
              Shuffle
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
