import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getHomePath, getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Iniciar sesión — CellFix",
};

export default async function LoginPage() {
  const session = await getSession().catch(() => null);
  if (session) redirect(getHomePath(session));

  return (
    <>
      <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight [font-stretch:118%]">
        Entra a tu taller
      </h1>
      <p className="mt-3 mb-9 text-zinc-600">Usa el correo y la contraseña de tu cuenta de CellFix.</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-zinc-600">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-zinc-900 hover:underline">
          Crea tu cuenta gratis
        </Link>
      </p>
      <p className="mt-8 border-t border-zinc-200 pt-6 text-sm leading-relaxed text-zinc-500">
        ¿Olvidaste tu contraseña? Pídele al administrador de tu taller que te asigne una nueva desde Equipo.
      </p>
    </>
  );
}
