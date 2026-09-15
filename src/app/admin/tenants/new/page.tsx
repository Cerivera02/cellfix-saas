import type { Metadata } from "next";
import Link from "next/link";
import { CreateTenantForm } from "@/components/admin/create-tenant-form";
import { requirePlatformAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Nuevo taller — Panel administrativo — CellFix",
};

export default async function NewTenantPage() {
  await requirePlatformAdmin();

  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Talleres
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Nuevo taller</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Se creará el taller junto con la cuenta de su propietario, que podrá iniciar sesión de inmediato.
      </p>

      <div className="mt-8 max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <CreateTenantForm />
      </div>
    </>
  );
}
