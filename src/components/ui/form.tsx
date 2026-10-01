export const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900";

export const primaryButtonClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClass =
  "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

export const buttonClass = `w-full py-2.5 ${primaryButtonClass}`;

export const ghostButtonClass =
  "rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-60";

export const dangerGhostButtonClass =
  "rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-red-600 transition hover:bg-red-50 disabled:opacity-60";

// Asterisco de campo obligatorio; los lectores de pantalla leen "obligatorio".
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-red-600">
        *
      </span>
      <span className="sr-only"> (obligatorio)</span>
    </>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  // Marca el campo como obligatorio con un asterisco.
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
        {required && <RequiredMark />}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-zinc-500">{hint}</p>
      )}
    </div>
  );
}
