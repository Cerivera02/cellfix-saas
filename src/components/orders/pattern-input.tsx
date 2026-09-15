"use client";

import { useRef, useState, type PointerEvent } from "react";
import { PATTERN_DOTS, PatternArrows, dotPosition } from "@/components/orders/unlock-view";
import { ghostButtonClass } from "@/components/ui/form";

type Point = { x: number; y: number };

// Radio (en unidades del viewBox) para considerar que el trazo tocó un punto.
const HIT_RADIUS = 12;

function rowCol(dot: number) {
  return { row: Math.floor((dot - 1) / 3), col: (dot - 1) % 3 };
}

// Agrega un punto al patrón. Como en Android, si el trazo pasa sobre un punto intermedio
// que no se ha usado (por ejemplo de 1 a 3 pasa por 2), también se agrega.
function extendPattern(current: number[], dot: number) {
  if (current.includes(dot)) return current;
  const next = [...current];
  const last = next.at(-1);
  if (last !== undefined) {
    const from = rowCol(last);
    const to = rowCol(dot);
    if ((from.row + to.row) % 2 === 0 && (from.col + to.col) % 2 === 0) {
      const middle = ((from.row + to.row) / 2) * 3 + (from.col + to.col) / 2 + 1;
      if (!next.includes(middle)) next.push(middle);
    }
  }
  next.push(dot);
  return next;
}

// Cuadrícula para dibujar el patrón con el dedo o el mouse. El valor es la secuencia "1-5-9-6".
export function PatternInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<number[]>([]);
  const [pointer, setPointer] = useState<Point | null>(null);
  const dots = value ? value.split("-").map(Number) : [];

  const toPoint = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  };

  const hitDot = (point: Point) =>
    PATTERN_DOTS.find((dot) => {
      const position = dotPosition(dot);
      return Math.hypot(position.x - point.x, position.y - point.y) <= HIT_RADIUS;
    }) ?? null;

  const addDotAt = (point: Point) => {
    const dot = hitDot(point);
    if (dot === null || pathRef.current.includes(dot)) return;
    pathRef.current = extendPattern(pathRef.current, dot);
    onChange(pathRef.current.join("-"));
  };

  const last = dots.at(-1);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        role="img"
        aria-label="Cuadrícula para dibujar el patrón de desbloqueo"
        className="size-48 shrink-0 cursor-crosshair touch-none rounded-xl border border-zinc-200 bg-zinc-50 select-none"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          pathRef.current = [];
          onChange("");
          const point = toPoint(event);
          setPointer(point);
          addDotAt(point);
        }}
        onPointerMove={(event) => {
          if (pointer === null) return;
          const point = toPoint(event);
          setPointer(point);
          addDotAt(point);
        }}
        onPointerUp={() => setPointer(null)}
        onPointerCancel={() => setPointer(null)}
      >
        {dots.length > 1 && (
          <polyline
            points={dots.map((dot) => `${dotPosition(dot).x},${dotPosition(dot).y}`).join(" ")}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-zinc-900"
          />
        )}
        <PatternArrows dots={dots} className="fill-zinc-900 stroke-zinc-50" />
        {pointer && last !== undefined && (
          <line
            x1={dotPosition(last).x}
            y1={dotPosition(last).y}
            x2={pointer.x}
            y2={pointer.y}
            strokeWidth={2}
            strokeLinecap="round"
            className="stroke-zinc-400"
          />
        )}
        {PATTERN_DOTS.map((dot) => {
          const { x, y } = dotPosition(dot);
          const used = dots.includes(dot);
          return (
            <g key={dot}>
              {used && <circle cx={x} cy={y} r={9} className="fill-zinc-900/10" />}
              <circle cx={x} cy={y} r={used ? 5 : 4} className={used ? "fill-zinc-900" : "fill-zinc-400"} />
            </g>
          );
        })}
      </svg>

      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-sm text-zinc-900">{dots.length > 0 ? dots.join(" → ") : "Sin dibujar"}</p>
        {dots.length > 0 && dots.length < 4 && <p className="text-xs text-amber-700">Mínimo 4 puntos.</p>}
        {dots.length > 0 && (
          <button
            type="button"
            onClick={() => {
              pathRef.current = [];
              onChange("");
            }}
            className={`self-start ${ghostButtonClass}`}
          >
            Borrar y volver a dibujar
          </button>
        )}
      </div>
    </div>
  );
}
