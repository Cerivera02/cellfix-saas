import { hasModule } from "@/lib/modules";
import { MAX_PHOTO_BYTES, PhotoError, savePhoto } from "@/lib/photos/core";
import { getActiveTenantModules } from "@/lib/tenancy/modules";

// Subida de una foto desde el celular. No usa sesión: la autoriza el token temporal del enlace.
export async function POST(request: Request, ctx: RouteContext<"/api/evidencia/[tenant]/[token]">) {
  const { tenant, token } = await ctx.params;

  // Taller inexistente, suspendido o sin evidencia fotográfica: el enlace no vale.
  const modules = await getActiveTenantModules(tenant);
  if (!modules || !hasModule(modules, "photos")) {
    return Response.json({ message: "El enlace no es válido." }, { status: 404 });
  }

  // Rechaza de entrada cuerpos demasiado grandes (margen para los encabezados del multipart).
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES + 64 * 1024) {
    return Response.json({ message: "La foto pesa demasiado (máximo 10 MB)." }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("photo");
  } catch {
    return Response.json({ message: "No se recibió la foto." }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ message: "No se recibió la foto." }, { status: 400 });

  try {
    const photo = await savePhoto(tenant, token, new Uint8Array(await file.arrayBuffer()));
    return Response.json({ id: photo.id }, { status: 201 });
  } catch (error) {
    if (error instanceof PhotoError) return Response.json({ message: error.message }, { status: error.status });
    console.error("Error al guardar la foto:", error);
    return Response.json({ message: "No pudimos guardar la foto. Inténtalo de nuevo." }, { status: 500 });
  }
}
