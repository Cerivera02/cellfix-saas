import { TicketPaper } from "@/components/tickets/ticket-paper";
import type { PaperWidth } from "@/lib/settings/ticket";

// Etiqueta para pegar en el equipo mientras está en el taller: folio grande y el equipo.
// Sin precios, contraseña ni teléfono; los técnicos también la imprimen.

export type DeviceLabelData = {
  folio: number;
  // Tipo, marca y modelo.
  device: string;
  color: string;
  // Nombre corto del cliente ("María L."); ver shortCustomerName.
  customerName: string;
  // Fecha de recepción, ya formateada.
  dateLabel: string;
};

// "María López Hernández" → "María L.". Solo el nombre si no hay apellido.
export function shortCustomerName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "";
  return `${words[0]} ${words[1].charAt(0).toUpperCase()}.`;
}

export function DeviceLabel({ label, width }: { label: DeviceLabelData; width: PaperWidth }) {
  return (
    <TicketPaper width={width}>
      <div className="text-center">
        <p className="text-[3em] leading-none font-bold tabular-nums">#{label.folio}</p>
        <p className="mt-2 text-[1.16em] leading-tight font-bold">{label.device}</p>
        {label.color && <p>{label.color}</p>}
        {(label.customerName || label.dateLabel) && (
          <p className="mt-1.5 text-[0.9em]">{[label.customerName, label.dateLabel].filter(Boolean).join(" · ")}</p>
        )}
      </div>
    </TicketPaper>
  );
}
