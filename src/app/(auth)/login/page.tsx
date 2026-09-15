import type { Metadata } from "next";
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
      <h1 className="text-2xl font-semibold tracking-tight">Inicia sesión</h1>
      <p className="mt-2 mb-8 text-sm text-zinc-600">Entra a tu cuenta de CellFix.</p>
      <LoginForm />
    </>
  );
}
