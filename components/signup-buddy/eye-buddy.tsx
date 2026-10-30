"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/*
 * A dark cube with two eyes, adapted from Bencho's eye tracker
 * (MIT, bencho.dev/licence). Each eye is a point on a sphere: the pointer
 * turns the sphere, and the eye heading for the rim moves less and narrows,
 * which is what makes the flat shape read as round.
 *
 * In the sign-up modal it reacts to the form: it watches the text cursor
 * (gaze), shuts its eyes for the password, and types what it's told to say.
 */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// A squircle-ish rounded square (22.4% corner radius) on an 88-unit cube centred in 100
const BODY = "M25.7 6 H74.3 A19.7 19.7 0 0 1 94 25.7 V74.3 A19.7 19.7 0 0 1 74.3 94 H25.7 A19.7 19.7 0 0 1 6 74.3 V25.7 A19.7 19.7 0 0 1 25.7 6 Z";
const EYE = { w: 13, h: 21, r: 6.5 };
/** How far apart the eyes sit, as a share of the sphere's radius */
const SPREAD = 0.21;
/** Head tilt when looking diagonally, in degrees per unit of x times y */
const TILT = 64;
const FOLLOW = 0.6;
const BOUNCE = 30;

export function EyeBuddy({
  size = 52,
  className = "",
  gaze = null,
  closed = false,
  say,
  bubble = "right",
  hops = 0,
  shakes = 0,
}: {
  size?: number;
  className?: string;
  /** A point on screen to look at instead of the pointer, e.g. the text cursor */
  gaze?: { x: number; y: number } | null;
  /** Eyes shut, looking away: for a password */
  closed?: boolean;
  /** Types this line into its bubble; "" hides the bubble */
  say?: string;
  /** Where the bubble sits */
  bubble?: "top" | "right";
  /** Raise to make it hop, or shake its head */
  hops?: number;
  shakes?: number;
}) {
  // Unique per cube, so two cubes on a page don't share a clip path
  const clipId = `eye-buddy-clip-${useId()}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const eyeRefs = useRef<(SVGGElement | null)[]>([]);
  const [line, setLine] = useState("");
  const [talking, setTalking] = useState(false);
  // The loop reads these each frame
  const gazeRef = useRef(gaze);
  const closedRef = useRef(closed);
  useEffect(() => {
    gazeRef.current = gaze;
    closedRef.current = closed;
  }, [gaze, closed]);

  // Types a line into the bubble; a newer line or hush() cancels it
  const run = useRef(0);
  const speak = useCallback(async (text: string) => {
    const id = ++run.current;
    for (let i = 0; i <= text.length; i++) {
      await new Promise((done) => window.setTimeout(done, i ? 32 + Math.random() * 28 : 0));
      if (id !== run.current) return;
      setTalking(true);
      setLine(text.slice(0, i));
    }
  }, []);
  const hush = useCallback(() => {
    run.current++;
    setTalking(false);
  }, []);

  // Gaze: spring toward the pointer, or toward the point the form gives
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let frame = 0;
    let last = 0;
    let blinkAt = 0;
    let nextBlink = performance.now() + 2200;
    let lid = 1;

    function aimAt(x: number, y: number, max = 0.85) {
      const box = root!.getBoundingClientRect();
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const amount = Math.min(max, Math.tanh(dist / 240) * FOLLOW * 1.5);
      s.tx = (dx / dist) * amount;
      s.ty = (dy / dist) * amount;
    }

    function draw(now: number) {
      // Blink: a quick squash every few seconds
      let open = 1;
      lid += ((closedRef.current ? 0.06 : 1) - lid) * 0.25;
      if (now > nextBlink) {
        blinkAt = now;
        nextBlink = now + 2600 + Math.random() * 3200;
      }
      const sinceBlink = now - blinkAt;
      if (!reduced && sinceBlink < 160) open = 1 - 0.9 * Math.sin((sinceBlink / 160) * Math.PI);
      open *= lid;

      const yaw = Math.asin(clamp(s.x, -0.92, 0.92));
      const pitch = -Math.asin(clamp(s.y, -0.92, 0.92));
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const tilt = TILT * s.x * s.y;

      [-SPREAD, SPREAD].forEach((x0, i) => {
        const eye = eyeRefs.current[i];
        const rect = eye?.firstElementChild;
        if (!eye || !rect) return;
        const z0 = Math.sqrt(1 - x0 * x0);
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y2 = -z1 * sp;
        const z2 = z1 * cp;
        const depth = clamp(z2, 0, 1);
        const sh = 0.45 + 0.55 * depth;
        const w = EYE.w * sh * (0.7 + 0.3 * depth);
        const h = Math.max(0.6, EYE.h * sh * open);
        rect.setAttribute("x", (-w / 2).toFixed(2));
        rect.setAttribute("y", (-h / 2).toFixed(2));
        rect.setAttribute("width", w.toFixed(2));
        rect.setAttribute("height", h.toFixed(2));
        rect.setAttribute("rx", Math.min(EYE.r, w / 2, h / 2).toFixed(2));
        eye.setAttribute("transform", `translate(${(50 + x1 * 50).toFixed(2)} ${(50 + y2 * 50).toFixed(2)}) rotate(${tilt.toFixed(2)})`);
        eye.style.opacity = z2 < 0.05 ? "0" : "1";
      });
    }

    function tick(now: number) {
      const dt = last ? Math.min(2.5, (now - last) / 16.67) : 1;
      last = now;
      // The form steers the gaze while it has something to show
      if (closedRef.current) {
        s.tx = 0.3;
        s.ty = -0.5;
      } else if (gazeRef.current) {
        // Less far than for the pointer: the form sits close by, and the eyes would leave the cube
        aimAt(gazeRef.current.x, gazeRef.current.y, 0.55);
      }
      if (reduced) {
        s.x = s.tx;
        s.y = s.ty;
      } else {
        const damping = 0.34 - (BOUNCE / 100) * 0.22;
        s.vx += ((s.tx - s.x) * 0.06 - s.vx * damping) * dt;
        s.vy += ((s.ty - s.y) * 0.06 - s.vy * damping) * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      draw(now);
      frame = requestAnimationFrame(tick);
    }

    function onMove(e: PointerEvent) {
      if (!gazeRef.current && !closedRef.current) aimAt(e.clientX, e.clientY);
    }
    function onLeave() {
      s.tx = 0;
      s.ty = 0;
    }

    frame = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useEffect(() => {
    if (say === undefined) return;
    if (say) return void speak(say);
    // On the next tick, like speak's first letter
    const timer = window.setTimeout(hush);
    return () => window.clearTimeout(timer);
  }, [say, speak, hush]);

  return (
    <span ref={rootRef} aria-hidden className={`relative block ${className}`} style={{ width: size, height: size }}>
      {/* Speech bubble, above the cube or beside it */}
      <span
        className={`pointer-events-none absolute flex min-h-[32px] items-center whitespace-nowrap rounded-[14px] bg-[var(--sb-bubble)] px-3.5 text-[13px] font-medium text-[var(--sb-bubble-fg)] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)] transition-[opacity,scale] duration-200 ${
          bubble === "right"
            ? "left-[calc(100%+12px)] top-1/2 -translate-y-1/2 origin-left rounded-bl-[6px]"
            : "bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 rounded-bl-[6px]"
        } ${talking ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
      >
        {line}
      </span>

      {/* keys restart the hop and the shake each time they're raised */}
      <span key={`shake-${shakes}`} className={`block h-full w-full ${shakes ? "sb-shake" : ""}`}>
        <span key={hops} className={`block h-full w-full ${hops ? "sb-hop" : ""}`}>
          <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible drop-shadow-[0_10px_12px_rgba(0,0,0,0.45)]">
            <path d={BODY} style={{ fill: "var(--sb-cube)" }} />
            <path d={BODY} fill="none" stroke="#ffffff" strokeOpacity={0.08} strokeWidth="1.5" />
            <clipPath id={clipId}>
              <path d={BODY} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              {[0, 1].map((i) => (
                <g
                  key={i}
                  ref={(el) => {
                    eyeRefs.current[i] = el;
                  }}
                  transform={`translate(${50 + (i ? SPREAD : -SPREAD) * 50} 50)`}
                >
                  <rect x={-EYE.w / 2} y={-EYE.h / 2} width={EYE.w} height={EYE.h} rx={EYE.r} style={{ fill: "var(--sb-eye)" }} />
                </g>
              ))}
            </g>
          </svg>
        </span>
      </span>
    </span>
  );
}
