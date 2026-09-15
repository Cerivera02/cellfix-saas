"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { EMAIL_PATTERN, PASSWORD_MAX_LENGTH, readField, readPassword } from "@/lib/validation";

export type LoginFormState =
  | {
      message?: string;
      fields?: { email: string };
    }
  | undefined;

type LoginRow = {
  id: string;
  password_hash: string;
  is_platform_admin: boolean;
  tenant_id: string | null;
};

export async function login(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = readField(formData, "email", 200).toLowerCase();
  const password = readPassword(formData);
  const fields = { email };

  if (!EMAIL_PATTERN.test(email) || !password || password.length > PASSWORD_MAX_LENGTH) {
    return { message: "Escribe tu correo y contraseña.", fields };
  }

  let destination: string;

  try {
    // Solo se consideran talleres activos; por ahora se entra al primero del usuario.
    const { rows } = await db.query<LoginRow>(
      `SELECT u.id, u.password_hash, u.is_platform_admin, m.tenant_id
         FROM users u
         LEFT JOIN LATERAL (
           SELECT mm.tenant_id
             FROM memberships mm
             JOIN tenants t ON t.id = mm.tenant_id
            WHERE mm.user_id = u.id AND t.status = 'active'
            ORDER BY mm.created_at
            LIMIT 1
         ) m ON true
        WHERE u.email = $1`,
      [email],
    );
    const user = rows[0];

    const isValid = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !isValid) {
      return { message: "Correo o contraseña incorrectos.", fields };
    }

    if (user.is_platform_admin) {
      await createSession(user.id, null);
      destination = "/admin";
    } else if (user.tenant_id) {
      await createSession(user.id, user.tenant_id);
      destination = "/dashboard";
    } else {
      return { message: "Tu usuario no tiene acceso a ningún taller activo.", fields };
    }
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return { message: "No pudimos iniciar sesión. Inténtalo más tarde.", fields };
  }

  redirect(destination);
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
