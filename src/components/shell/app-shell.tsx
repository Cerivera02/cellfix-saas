import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar, type SidebarProps } from "@/components/shell/sidebar";

// Estructura de las zonas privadas: sidebar fijo en escritorio y menú deslizable en móvil.
export function AppShell({ children, ...props }: SidebarProps & { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 bg-zinc-50 print:bg-white">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-zinc-200 bg-white lg:block print:hidden">
        <Sidebar {...props} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav {...props} />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
