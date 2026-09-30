import type { Metadata } from "next";
import { MobileUploader } from "@/components/photos/mobile-uploader";
import { hasModule } from "@/lib/modules";
import { getActiveTenantName, getUploadSession } from "@/lib/photos/core";
import { getActiveTenantModules } from "@/lib/tenancy/modules";

export const metadata: Metadata = {
  title: "Evidencia fotográfica — CellFix",
  robots: { index: false, follow: false },
};

const timeFormatter = new Intl.DateTimeFormat("es-MX", { timeStyle: "short", timeZone: "America/Mexico_City" });

// Página que abre el celular al escanear el código QR. No requiere sesión: el token del enlace
// autoriza subir fotos a una sola orden y caduca.
export default async function EvidencePage(props: PageProps<"/evidencia/[tenant]/[token]">) {
  const { tenant, token } = await props.params;
  // Con la evidencia fotográfica apagada el enlace se trata como no válido.
  const modules = await getActiveTenantModules(tenant);
  const tenantName = modules && hasModule(modules, "photos") ? await getActiveTenantName(tenant) : null;
  const upload = tenantName ? await getUploadSession(tenant, token) : null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      {tenantName && <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{tenantName}</p>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Evidencia fotográfica</h1>

      {upload ? (
        <>
          <p className="mt-1 text-sm text-zinc-600">{upload.orderLabel ?? "Equipo en recepción"}</p>
          <p className="mt-3 rounded-lg bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-700">
            Toma fotos del equipo por todos sus lados: pantalla, tapa, esquinas y cualquier golpe o rayón. El enlace es
            válido hasta las {timeFormatter.format(upload.expiresAt)}.
          </p>
          <MobileUploader uploadUrl={`/api/evidencia/${tenant}/${token}`} initialCount={upload.photoCount} />
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="font-medium">Este enlace ya no es válido</p>
          <p className="mt-1 text-sm text-zinc-500">
            Caducó o la orden ya se cerró. Pide en el mostrador que generen un nuevo código QR.
          </p>
        </div>
      )}
    </main>
  );
}
