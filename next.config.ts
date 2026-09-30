import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// En desarrollo, el servidor bloquea el JavaScript de la página a cualquier origen que no sea localhost.
// Se permiten las IPs de red local de esta computadora (para abrir la app desde otro equipo o desde
// el celular al escanear el código QR) y el host de APP_URL.
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => address!.address);
}

function appUrlHostname() {
  try {
    return process.env.APP_URL ? [new URL(process.env.APP_URL).hostname] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set([...lanAddresses(), ...appUrlHostname()])],
};

export default nextConfig;
