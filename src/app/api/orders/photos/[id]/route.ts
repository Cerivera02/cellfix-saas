import { getSession } from "@/lib/auth/session";
import { ORDER_ACCESS_PERMISSIONS } from "@/lib/orders/labels";
import { readPhoto } from "@/lib/photos/core";

// Sirve una foto de evidencia. Exige sesión del taller con acceso a Órdenes.
export async function GET(_request: Request, ctx: RouteContext<"/api/orders/photos/[id]">) {
  const session = await getSession();
  if (
    !session ||
    session.kind !== "tenant" ||
    !ORDER_ACCESS_PERMISSIONS.some((permission) => session.permissions.includes(permission))
  ) {
    return new Response("No autorizado", { status: 401 });
  }

  const { id } = await ctx.params;
  const photo = await readPhoto(session.tenant.id, id);
  if (!photo) return new Response("No encontrada", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
