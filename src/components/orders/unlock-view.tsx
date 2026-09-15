import { UNLOCK_TYPE_LABELS, parsePattern, type UnlockType } from "@/lib/orders/labels";

// Cuadrícula 3×3 del patrón en un viewBox de 100×100. Punto 1 arriba a la izquierda, 9 abajo a la derecha.
const POSITIONS = [20, 50, 80];

export function dotPosition(dot: number) {
  const index = dot - 1;
  return { x: POSITIONS[index % 3], y: POSITIONS[Math.floor(index / 3)] };
}

export const PATTERN_DOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Flecha a la mitad de cada tramo, apuntando hacia el siguiente punto del patrón.
export function PatternArrows({ dots, className }: { dots: number[]; className: string }) {
  return dots.slice(1).map((dot, index) => {
    const from = dotPosition(dots[index]);
    const to = dotPosition(dot);
    const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    return (
      <polygon
        key={`${dots[index]}-${dot}`}
        points="5,0 -3.5,-4.5 -3.5,4.5"
        transform={`translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2}) rotate(${angle})`}
        strokeWidth={1}
        strokeLinejoin="round"
        className={className}
      />
    );
  });
}

// Patrón dibujado con el orden de cada punto; el inicio lleva un anillo.
export function PatternView({ dots, className = "size-28" }: { dots: number[]; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Patrón: ${dots.join(", ")}`}
      className={`${className} shrink-0 rounded-xl border border-zinc-200 bg-zinc-50`}
    >
      <polyline
        points={dots.map((dot) => `${dotPosition(dot).x},${dotPosition(dot).y}`).join(" ")}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-zinc-400"
      />
      <PatternArrows dots={dots} className="fill-zinc-700 stroke-zinc-50" />
      {PATTERN_DOTS.map((dot) => {
        const { x, y } = dotPosition(dot);
        const order = dots.indexOf(dot);
        if (order === -1) return <circle key={dot} cx={x} cy={y} r={3} className="fill-zinc-300" />;
        return (
          <g key={dot}>
            {order === 0 && <circle cx={x} cy={y} r={11} fill="none" strokeWidth={2} className="stroke-zinc-900" />}
            <circle cx={x} cy={y} r={8} className="fill-zinc-900" />
            <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={9} fontWeight={600} className="fill-white">
              {order + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Cómo se muestra el desbloqueo en la orden.
export function UnlockValue({ type, code }: { type: UnlockType; code: string }) {
  if (type === "none" || !code) return <span>{UNLOCK_TYPE_LABELS.none}</span>;

  if (type === "pattern") {
    const dots = parsePattern(code);
    if (dots) {
      return (
        <span className="flex items-center gap-3">
          <PatternView dots={dots} />
          <span className="text-xs text-zinc-500">
            Patrón
            <span className="block font-mono">{dots.join("-")}</span>
          </span>
        </span>
      );
    }
  }

  return (
    <span>
      {UNLOCK_TYPE_LABELS[type]}: <span className="font-mono">{code}</span>
    </span>
  );
}
