import { redirect } from "next/navigation";

// Las cuentas bancarias se movieron a Configuración: también se usan sin el módulo de Caja.
export default function CashAccountsPage() {
  redirect("/dashboard/settings/accounts");
}
