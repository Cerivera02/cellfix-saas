"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  message,
  className,
  children,
}: {
  message?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (message && !window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
