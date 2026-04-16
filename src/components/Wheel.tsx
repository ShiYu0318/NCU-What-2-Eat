"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { Restaurant } from "./ShopSheet";

export type WheelRestaurant = Pick<
  Restaurant,
  "id" | "name" | "google_maps" | "type" | "price_range" | "cover_image"
>;

export type SpinState = "idle" | "spinning" | "stopping" | "done";

export type WheelHandle = { reset: () => void };

type Props = {
  restaurants: WheelRestaurant[];
  onResult: (r: WheelRestaurant) => void;
  onSpinStateChange?: (state: SpinState) => void;
};

const MAX_SPEED = 0.22; // rad/frame（約 2.1 圈/秒）
const ACCEL = MAX_SPEED / 60; // 1 秒加速到最高速

const COLORS = [
  "#1d6ef4", "#30d158", "#ff9f0a", "#ff375f",
  "#bf5af2", "#5e5ce6", "#32ade6", "#ff6b35",
];

export const Wheel = forwardRef<WheelHandle, Props>(function Wheel(
  { restaurants, onResult, onSpinStateChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef(300);

  // 動畫狀態全用 ref 避免 rAF 內觸發 re-render
  const rotationRef = useRef(0);
  const speedRef = useRef(0);
  const stateRef = useRef<SpinState>("idle");
  const targetRotRef = useRef(0);
  const stopDistRef = useRef(0);
  const winnerRef = useRef<WheelRestaurant | null>(null);
  const rafRef = useRef<number>(0);

  // 只用來控制按鈕顯示
  const [spinState, setSpinState] = useState<SpinState>("idle");

  const restaurantsRef = useRef(restaurants);
  useEffect(() => { restaurantsRef.current = restaurants; }, [restaurants]);

  // 讓 rAF 呼叫最新版 tick，避免 tick 內部自我參考造成 ESLint 錯誤
  const tickRef = useRef<() => void>(() => {});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = sizeRef.current;
    const R = size / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const rests = restaurantsRef.current;
    const N = rests.length;
    const rotation = rotationRef.current;

    if (N === 0) {
      ctx.beginPath();
      ctx.arc(R, R, R - 4, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    const segAngle = (2 * Math.PI) / N;

    // 文字徑向範圍：innerR 藏在中心按鈕（r=40）後面，outerR 離邊緣留白
    const innerR = 42;
    const outerR = R - 14;
    const midR = (innerR + outerR) / 2;
    const availLen = outerR - innerR;

    // 字型大小根據 chord 寬限制，避免文字超出格子
    const chord = 2 * midR * Math.sin(Math.min(segAngle / 2, Math.PI / 2));
    const fontSize = Math.max(9, Math.min(14, Math.floor(chord * 0.72)));

    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let i = 0; i < N; i++) {
      const startAngle = -Math.PI / 2 + rotation + i * segAngle;
      const endAngle = startAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 4, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();

      if (N > 1) {
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 旋轉讓外圍方向對到 -x，文字從外往內（左到右）橫式繪製
      const mid = startAngle + segAngle / 2;
      let label = rests[i].name;
      if (ctx.measureText(label).width > availLen) {
        while (label.length > 1 && ctx.measureText(label + "…").width > availLen) {
          label = label.slice(0, -1);
        }
        label += "…";
      }

      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(mid + Math.PI);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(label, -outerR, 0);
      ctx.restore();
    }

    // 中心圓蓋住轉軸
    ctx.beginPath();
    ctx.arc(R, R, 18, 0, 2 * Math.PI);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, []);

  const tick = useCallback(() => {
    const state = stateRef.current;

    if (state === "spinning") {
      speedRef.current = Math.min(speedRef.current + ACCEL, MAX_SPEED);
      rotationRef.current += speedRef.current;
    } else if (state === "stopping") {
      const remaining = targetRotRef.current - rotationRef.current;
      const progress = Math.max(0, 1 - remaining / stopDistRef.current);

      // 前 88% 線性減速，後 12% 慢慢收尾
      let targetSpeed: number;
      if (progress < 0.88) {
        targetSpeed = MAX_SPEED * (1 - 0.82 * (progress / 0.88));
      } else {
        const t = (progress - 0.88) / 0.12;
        targetSpeed = MAX_SPEED * 0.18 * (1 - t);
      }
      speedRef.current = Math.max(targetSpeed, 0.003);

      rotationRef.current = Math.min(
        rotationRef.current + speedRef.current,
        targetRotRef.current
      );

      if (rotationRef.current >= targetRotRef.current) {
        rotationRef.current = targetRotRef.current;
        speedRef.current = 0;
        stateRef.current = "done";
        setSpinState("done");
        onSpinStateChange?.("done");
        draw();
        if (winnerRef.current) onResult(winnerRef.current);
        return;
      }
    }

    draw();
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [draw, onResult, onSpinStateChange]);

  useEffect(() => { tickRef.current = tick; }, [tick]);

  const start = useCallback(() => {
    if (stateRef.current !== "idle" || restaurantsRef.current.length === 0) return;
    stateRef.current = "spinning";
    speedRef.current = 0;
    setSpinState("spinning");
    onSpinStateChange?.("spinning");
    rafRef.current = requestAnimationFrame(tick);
  }, [tick, onSpinStateChange]);

  const stop = useCallback(() => {
    if (stateRef.current !== "spinning") return;
    const rests = restaurantsRef.current;
    const N = rests.length;
    if (N === 0) return;

    const segAngle = (2 * Math.PI) / N;
    const winnerIdx = Math.floor(Math.random() * N);
    winnerRef.current = rests[winnerIdx];

    // 指針在左側（角度 π），計算讓中獎格對齊指針的目標旋轉量
    // 格 i 中點角度 = -π/2 + rotation + (i+0.5)*seg，要讓它等於 π
    // -> rotation = 3π/2 - (i+0.5)*seg (mod 2π)
    const minExtraRot = (0.5 + Math.random() * 1.0) * 2 * Math.PI;
    const base = ((3 * Math.PI / 2 - (winnerIdx + 0.5) * segAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const k = Math.ceil((rotationRef.current + minExtraRot - base) / (2 * Math.PI));
    const target = base + k * 2 * Math.PI;

    targetRotRef.current = target;
    stopDistRef.current = target - rotationRef.current;
    stateRef.current = "stopping";
    setSpinState("stopping");
    onSpinStateChange?.("stopping");
  }, [onSpinStateChange]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stateRef.current = "idle";
    rotationRef.current = 0;
    speedRef.current = 0;
    winnerRef.current = null;
    setSpinState("idle");
    onSpinStateChange?.("idle");
    draw();
  }, [draw, onSpinStateChange]);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement!;

    const resize = () => {
      const size = container.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = size;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      draw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    if (stateRef.current === "idle") {
      rotationRef.current = 0;
      draw();
    }
  }, [restaurants, draw]);

  const N = restaurants.length;
  const isIdle = spinState === "idle";
  const isSpinning = spinState === "spinning";

  return (
    <div className="relative size-full">
      <canvas ref={canvasRef} className="block size-full" />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {N === 0 && isIdle && (
          <p className="text-xs text-text-muted">選擇商家後開始</p>
        )}
        {N > 0 && isIdle && (
          <button
            type="button"
            onClick={start}
            className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent text-sm font-bold text-white shadow-lg transition-transform active:scale-90"
          >
            開始
          </button>
        )}
        {isSpinning && (
          <button
            type="button"
            onClick={stop}
            className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white shadow-lg transition-transform active:scale-90"
          >
            停止
          </button>
        )}
      </div>
    </div>
  );
});
