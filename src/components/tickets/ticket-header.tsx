import type { TicketBusiness } from "@/lib/settings/ticket";

// Encabezado de los tickets con los datos del negocio; `children` agrega las líneas del documento.
export function TicketHeader({ business, children }: { business: TicketBusiness; children?: React.ReactNode }) {
  return (
    <header className="text-center">
      <p className="text-[1.16em] font-bold">{business.name}</p>
      {business.address && <p className="whitespace-pre-line">{business.address}</p>}
      {business.phone && <p>Tel. {business.phone}</p>}
      {business.taxId && <p>RFC: {business.taxId}</p>}
      {children && <div className="mt-1.5">{children}</div>}
    </header>
  );
}
