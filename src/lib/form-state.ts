// Estado que devuelven las Server Actions de formularios a useActionState.
export type FormState =
  | {
      success?: string;
      message?: string;
      errors?: Record<string, string>;
      fields?: Record<string, string>;
      // Valores de casillas múltiples (roles, permisos) para conservarlos tras un error.
      selections?: Record<string, string[]>;
    }
  | undefined;
