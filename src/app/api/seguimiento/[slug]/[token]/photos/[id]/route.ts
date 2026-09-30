import { readTrackingPhoto } from "@/lib/tracking/core";

// Foto de evidencia para la página pública de seguimiento. No usa sesión: la autoriza el token
// de la orden, y solo sirve fotos de esa orden.
export async function GET(_request: Request, ctx: RouteContext<"/api/seguimiento/[slug]/[token]/photos/[id]">) {
  const { slug, token, id } = await ctx.params;
  const photo = await readTrackingPhoto(slug, token, id);
  if (!photo) return new Response("No encontrada", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
