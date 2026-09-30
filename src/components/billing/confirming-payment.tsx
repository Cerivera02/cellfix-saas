"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Mientras Stripe confirma el pago (el webhook aún no llega), vuelve a pedir la página cada
// pocos segundos, hasta un minuto. Cuando la suscripción queda activa el aviso cambia solo.
export function ConfirmingPayment() {
  const router = useRouter();

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 12) window.clearInterval(timer);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
      Estamos confirmando tu pago… Esto tarda unos segundos; la página se actualiza sola.
    </p>
  );
}
