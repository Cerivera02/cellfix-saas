import { inputClass } from "@/components/ui/form";

export function MoneyInput({ id, name, defaultValue }: { id: string; name: string; defaultValue?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-zinc-400">$</span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        defaultValue={defaultValue}
        className={`${inputClass} tabular-nums`}
        style={{ paddingLeft: "1.75rem" }}
      />
    </div>
  );
}
