import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8">{children}</div>
      </main>
    </div>
  );
}
