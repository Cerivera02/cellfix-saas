import "server-only";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "./ip";

// IP del cliente dentro de Server Actions y páginas.
export async function clientIp() {
  return clientIpFromHeaders(await headers());
}
