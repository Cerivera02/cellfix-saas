import type { FormState } from "@/lib/form-state";

export function FormMessage({ state }: { state: FormState }) {
  return (
    <p aria-live="polite" className={`min-h-5 text-sm ${state?.success ? "text-emerald-600" : "text-red-600"}`}>
      {state?.success ?? state?.message}
    </p>
  );
}
