import type { NextConfig } from "next";

// En desarrollo, el celular abre el enlace del código QR con la IP de la computadora (APP_URL).
// El servidor de desarrollo bloquea otros orígenes por defecto, así que se permite ese host.
function appUrlHostname() {
  try {
    return process.env.APP_URL ? [new URL(process.env.APP_URL).hostname] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: appUrlHostname(),
};

export default nextConfig;
