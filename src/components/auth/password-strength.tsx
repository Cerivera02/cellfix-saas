// Semáforo de seguridad de la contraseña: rojo (débil), amarillo (media) y verde (fuerte).
// Es solo una guía visual; el servidor sigue exigiendo únicamente el largo mínimo.
// Ocupa siempre el mismo alto (también vacío) para que el formulario no brinque al escribir.

type Level = { label: string; bars: number; color: string; text: string };

const LEVELS: Record<"weak" | "medium" | "strong", Level> = {
  weak: { label: "Débil", bars: 1, color: "bg-red-500", text: "text-red-600" },
  medium: { label: "Media", bars: 2, color: "bg-amber-400", text: "text-amber-700" },
  strong: { label: "Fuerte", bars: 3, color: "bg-emerald-500", text: "text-emerald-700" },
};

function evaluate(password: string, minLength: number) {
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < minLength) return { level: LEVELS.weak, variety };
  const score = variety + (password.length >= 12 ? 1 : 0);
  return { level: score >= 4 ? LEVELS.strong : score >= 2 ? LEVELS.medium : LEVELS.weak, variety };
}

export function PasswordStrength({ password, minLength }: { password: string; minLength: number }) {
  const result = password ? evaluate(password, minLength) : null;
  const level = result?.level ?? null;

  let tip = "";
  if (!password || password.length < minLength) tip = `Al menos ${minLength} caracteres.`;
  else if (level !== LEVELS.strong) tip = (result?.variety ?? 0) < 3 ? "Agrega mayúsculas, números o símbolos." : "Hazla un poco más larga.";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`h-1.5 flex-1 rounded-full transition-colors ${level && bar <= level.bars ? level.color : "bg-zinc-200"}`}
          />
        ))}
      </div>
      <p aria-live="polite" className="truncate text-xs leading-4 text-zinc-500">
        {level && (
          <>
            Seguridad: <span className={`font-medium ${level.text}`}>{level.label}</span>
            {tip && " · "}
          </>
        )}
        {tip}
      </p>
    </div>
  );
}
