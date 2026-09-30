import type { PaperWidth } from "@/lib/settings/ticket";

// Hoja de ticket térmico (58 u 80 mm) y piezas comunes. Sin estado: sirve en páginas del servidor
// y en la vista previa de la configuración.

const PAPER_CLASSES: Record<PaperWidth, string> = {
  "58": "max-w-[58mm] p-3 text-[11px] print:max-w-[58mm]",
  "80": "max-w-[80mm] p-4 text-[12px] print:max-w-[80mm]",
};

export function TicketPaper({ width, children }: { width: PaperWidth; children: React.ReactNode }) {
  return (
    <article
      className={`mx-auto w-full bg-white font-mono leading-snug break-words text-black shadow-sm ring-1 ring-zinc-200 print:p-0 print:shadow-none print:ring-0 ${PAPER_CLASSES[width]}`}
    >
      {children}
    </article>
  );
}

export function TicketDivider() {
  return <hr className="my-2 border-t border-dashed border-zinc-400" />;
}

export function TicketRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-[1.08em] font-bold" : ""}`}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
