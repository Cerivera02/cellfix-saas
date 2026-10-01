import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getHomePath, getSession } from "@/lib/auth/session";
import { getPublicPricing } from "@/lib/billing/pricing";

export const metadata: Metadata = {
  title: "Crea tu cuenta — CellFix",
};

export default async function SignupPage() {
  const session = await getSession().catch(() => null);
  if (session) redirect(getHomePath(session));

  // Si la base aún no tiene la configuración de precios, se usa el valor por omisión.
  const trialDays = await getPublicPricing()
    .then((pricing) => pricing.trialDays)
    .catch(() => 30);

  return (
    <>
      <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight [font-stretch:118%]">
        Prueba CellFix gratis
      </h1>
      <p className="mt-3 mb-6 text-zinc-600">
        {trialDays} días con todos los módulos, sin tarjeta. Al terminar eliges qué quieres pagar.
      </p>
      <SignupForm />
      <p className="mt-6 border-t border-zinc-200 pt-5 text-sm text-zinc-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-zinc-900 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
