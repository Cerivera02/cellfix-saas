import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { clientIpFromHeaders } from "@/lib/rate-limit/ip";
import { createRateLimiter } from "@/lib/rate-limit/limiter";
import { PROXY_LIMITS, TOO_MANY_REQUESTS_MESSAGE } from "@/lib/rate-limit/limits";

// Límite global por IP para métodos que modifican (incluye las Server Actions, que llegan como POST
// a la ruta de la página con el encabezado Next-Action). Los GET no pasan por aquí.
// El proxy corre aparte del render: su almacén en memoria es propio (no lo comparte con las
// Server Actions), y con varias instancias cada una cuenta por su lado.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const generalLimiter = createRateLimiter("proxy", PROXY_LIMITS.general);
const evidenceLimiter = createRateLimiter("proxy-evidence", PROXY_LIMITS.evidence);

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function tooManyRequests(request: NextRequest, retryAfterSeconds: number) {
  const headers = { "Retry-After": String(retryAfterSeconds) };
  // Para una Server Action el cliente de Next muestra el texto solo si el tipo es exactamente
  // text/plain (sin charset); fetch lo decodifica como UTF-8 de todos modos.
  if (request.headers.has("next-action")) {
    return new NextResponse(TOO_MANY_REQUESTS_MESSAGE, {
      status: 429,
      headers: { ...headers, "Content-Type": "text/plain" },
    });
  }
  // Para fetch propios (p. ej. la subida de fotos) se responde { message } como el resto de la API.
  return NextResponse.json({ message: TOO_MANY_REQUESTS_MESSAGE }, { status: 429, headers });
}

async function rateLimit(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // El webhook de Stripe llega en ráfagas y con reintentos desde pocas IPs: nunca se limita.
  if (!MUTATING_METHODS.has(request.method) || isUnder(pathname, "/api/stripe/webhook")) return null;

  const limiter = isUnder(pathname, "/api/evidencia") ? evidenceLimiter : generalLimiter;
  const result = await limiter.consume(clientIpFromHeaders(request.headers));
  return result.allowed ? null : tooManyRequests(request, result.retryAfterSeconds);
}

export async function proxy(request: NextRequest) {
  const limited = await rateLimit(request);
  if (limited) return limited;

  // Chequeo optimista: solo verifica que exista la cookie.
  // La validación real contra la base de datos ocurre en requireTenantSession() / requirePlatformAdmin().
  const { pathname } = request.nextUrl;
  if ((isUnder(pathname, "/dashboard") || isUnder(pathname, "/admin")) && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos archivos estáticos y de imágenes de Next, archivos con extensión (public/) y el
  // webhook de Stripe. Los GET de páginas pasan por aquí pero solo se revisa la cookie en
  // /dashboard y /admin.
  matcher: ["/((?!_next/static|_next/image|api/stripe/webhook|.*\\.[a-zA-Z0-9]+$).*)"],
};
