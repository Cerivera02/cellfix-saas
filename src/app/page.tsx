import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { FaqAccordion } from "@/components/faq-accordion";
import { LeadForm } from "@/components/lead-form";
import { EvidenceShowcase } from "@/components/landing/evidence-showcase";
import { PricingSection } from "@/components/landing/pricing-section";
import { RolePreview } from "@/components/landing/role-preview";
import { ServiceTicket } from "@/components/landing/service-ticket";
import { brandFonts } from "@/app/fonts";
import { getPublicPricing, type PublicPricing } from "@/lib/billing/pricing";

const title = "CellFix — Sistema para talleres de reparación de celulares y electrónica";
const description =
  "Órdenes de servicio con folio, caja, inventario de refacciones y clientes en un solo lugar. Para talleres de celulares, tablets, laptops, televisiones y consolas. Prueba gratis, sin tarjeta.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", locale: "es_MX", siteName: "CellFix" },
  twitter: { card: "summary", title, description },
};

const devices = ["Celulares", "Tablets", "Laptops", "Televisiones", "Consolas", "Relojes", "Teclados"];

// Los estados reales de una orden en CellFix, en el orden en que suceden.
const journey = [
  { status: "Recibido", description: "Anotas los datos del cliente y de su equipo, y le das su comprobante." },
  { status: "En diagnóstico", description: "Revisas el equipo y escribes qué tiene." },
  { status: "Esperando autorización", description: "Le dices al cliente cuánto cuesta y esperas su respuesta." },
  { status: "Esperando refacción", description: "Si falta una pieza, el equipo espera sin que se te olvide." },
  { status: "En reparación", description: "Haces el arreglo y anotas lo que usaste." },
  { status: "Listo para entregar", description: "El equipo ya está listo para que el cliente pase por él." },
  { status: "Entregado", description: "El cliente paga lo que falta y se lleva su equipo." },
];

const modules = [
  {
    label: "Caja",
    description: "Apertura y corte de turno, ventas de mostrador, devoluciones y tickets.",
  },
  {
    label: "Inventario",
    description: "Refacciones y accesorios por categoría, con existencias y movimientos.",
  },
  {
    label: "Compras",
    description: "Pedidos a proveedores y los pagos que les vas haciendo.",
  },
  {
    label: "Clientes",
    description: "Historial de reparaciones por cliente y sus datos fiscales: RFC y régimen del SAT.",
  },
  {
    label: "Equipo",
    description: "Usuarios con roles del sistema o armados a la medida de tu taller.",
  },
];

function buildFaqs(trialDays: number | null) {
  const trial = trialDays ? `${trialDays} días gratis` : "un periodo de prueba gratis";
  return [
    {
      question: "¿Necesito instalar algo?",
      answer: "No. CellFix funciona desde el navegador en computadora, tablet o celular.",
    },
    {
      question: "¿Sirve si no reparo celulares?",
      answer: "Sí. Funciona para cualquier taller de electrónica: laptops, televisiones, consolas, relojes, teclados y más.",
    },
    {
      question: "¿Mis técnicos pueden ver lo que cobro?",
      answer: "Solo si tú se lo permites. Cada persona tiene un rol, y los precios y cobros quedan para quien atiende la caja.",
    },
    {
      question: "¿Cómo funciona la prueba y el cobro?",
      answer: `Al crear tu cuenta tienes ${trial} con todos los módulos, sin tarjeta. Después eliges los módulos que quieres conservar y el cobro es mensual. Puedes cancelar cuando quieras.`,
    },
  ];
}

// Los precios viven en la base de datos y se editan desde el panel administrativo. Si no se
// pueden leer (p. ej. antes de aplicar la migración de cobros), la landing sigue sin ellos.
async function loadPricing(): Promise<PublicPricing | null> {
  try {
    return await getPublicPricing();
  } catch (error) {
    console.warn("No se pudieron leer los precios públicos:", error);
    return null;
  }
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default async function Home() {
  // Se renderiza en cada visita para que un cambio de precio se vea sin reconstruir.
  await connection();
  const pricing = await loadPricing();
  const faqs = buildFaqs(pricing?.trialDays ?? null);

  return (
    <div
      className={`${brandFonts} flex flex-1 flex-col font-body`}
    >
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#" className={`flex items-center gap-2 rounded-md ${focusRing}`}>
            <span className="grid size-7 place-items-center rounded-md bg-zinc-900 font-display text-xs font-bold text-white">
              CF
            </span>
            <span className="font-display text-lg font-bold tracking-tight [font-stretch:112%]">CellFix</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
            <a href="#recorrido" className={`rounded hover:text-zinc-900 ${focusRing}`}>El recorrido</a>
            <a href="#evidencia" className={`rounded hover:text-zinc-900 ${focusRing}`}>Evidencia</a>
            <a href="#taller" className={`rounded hover:text-zinc-900 ${focusRing}`}>Todo el taller</a>
            <a href="#precios" className={`rounded hover:text-zinc-900 ${focusRing}`}>Precios</a>
            <a href="#preguntas" className={`rounded hover:text-zinc-900 ${focusRing}`}>Preguntas</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className={`hidden rounded text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:block ${focusRing}`}>
              Iniciar sesión
            </Link>
            <Link
              href="/registro"
              className={`rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 ${focusRing}`}
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: el talón de servicio es la tesis de la página. */}
        <section className="overflow-hidden bg-zinc-50 [--perf-bg:var(--color-zinc-50)]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 md:pt-24 md:pb-28 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink uppercase [font-stretch:80%]">
                {pricing ? `Prueba gratis ${pricing.trialDays} días · Sin tarjeta` : "Prueba gratis · Sin tarjeta"}
              </p>
              <h1 className="mt-5 font-display text-[2.6rem] leading-[0.98] font-extrabold tracking-tight text-balance [font-stretch:118%] sm:text-6xl">
                Del mostrador a la entrega, cada equipo con su folio.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-zinc-600 text-pretty">
                CellFix es el sistema para talleres de reparación de celulares y electrónica. Órdenes,
                caja, inventario y clientes en un solo lugar, desde el navegador.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/registro"
                  className={`rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 ${focusRing}`}
                >
                  Empieza tu prueba gratis
                </Link>
                <a
                  href="#recorrido"
                  className={`rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 ${focusRing}`}
                >
                  Ver cómo avanza una orden
                </a>
              </div>
            </div>

            <ServiceTicket />
          </div>
        </section>

        {/* Dispositivos */}
        <section className="border-y border-zinc-200 bg-white">
          <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-5 text-sm text-zinc-500 sm:px-6">
            <span>Para talleres que reparan</span>
            {devices.map((device, index) => (
              <span key={device} className="font-medium text-zinc-800">
                {device}
                {index < devices.length - 1 && <span className="ml-3 text-zinc-300" aria-hidden="true">·</span>}
              </span>
            ))}
          </p>
        </section>

        {/* El recorrido: los siete estados reales de una orden, sobre tapete antiestático. */}
        <section id="recorrido" className="mat-grid scroll-mt-16 text-white">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
                El recorrido de un equipo
              </h2>
              <p className="mt-4 text-mat-text">
                Así avanza cada equipo que te dejan. En todo momento sabes en qué paso va, sin buscar en
                libretas ni preguntar.
              </p>
            </div>

            {/* Panel translúcido detrás de los pasos: separa el texto de la cuadrícula del tapete. */}
            <div className="mt-14 rounded-2xl bg-mat-deep/80 px-5 py-3 shadow-[0_0_80px_24px_rgb(36_58_71/0.7)] ring-1 ring-white/10 backdrop-blur-sm sm:px-8 sm:py-5">
            <ol className="border-l border-mat-text/30">
              {journey.map((step, index) => (
                <li
                  key={step.status}
                  className="relative grid gap-2 py-5 pl-8 sm:grid-cols-[16rem_1fr] sm:gap-8 sm:pl-10"
                >
                  <span
                    aria-hidden="true"
                    className="absolute top-[1.65rem] -left-[5px] size-[9px] rounded-full bg-white ring-4 ring-mat-deep"
                  />
                  <p className="flex items-baseline gap-3">
                    <span className="font-folio text-xs text-mat-text">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-display text-lg font-bold tracking-wide uppercase [font-stretch:75%]">
                      {step.status}
                    </span>
                  </p>
                  <p className="max-w-xl text-base leading-relaxed text-white/90">{step.description}</p>
                </li>
              ))}
            </ol>
            </div>
          </div>
        </section>

        <EvidenceShowcase />

        {/* Módulos: etiquetas como las de los cajones de refacciones. */}
        <section id="taller" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
              Todo el taller, no solo las órdenes
            </h2>
            <p className="mt-4 text-zinc-600">
              Lo que pasa en el mostrador y en la bodega queda conectado con cada reparación.
            </p>
          </div>

          <dl className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <div key={module.label}>
                <dt>
                  <span className="inline-block rounded-sm border border-zinc-300 bg-zinc-50 px-2.5 py-1 font-display text-sm font-bold tracking-[0.14em] text-zinc-800 uppercase [font-stretch:75%]">
                    {module.label}
                  </span>
                </dt>
                <dd className="mt-3 leading-relaxed text-zinc-600">{module.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Roles: la misma orden vista por cada rol del sistema. */}
        <section id="roles" className="scroll-mt-16 border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
                Cada quien ve lo suyo
              </h2>
              <p className="mt-4 leading-relaxed text-zinc-600">
                Los permisos siguen el rol de cada persona. Tu técnico repara sin ver lo que se cobra, y la caja
                queda en manos de quien la opera.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                ¿Tu taller se organiza distinto? Arma roles a la medida con los permisos que necesites.
              </p>
            </div>
            <RolePreview />
          </div>
        </section>

        <PricingSection pricing={pricing} />

        {/* Preguntas */}
        <section id="preguntas" className="scroll-mt-16 border-t border-zinc-200">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
              Preguntas frecuentes
            </h2>
            <FaqAccordion items={faqs} />
          </div>
        </section>

        {/* Contacto */}
        <section id="contacto" className="scroll-mt-16 border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
                ¿Tienes dudas? Escríbenos
              </h2>
              <p className="mt-4 leading-relaxed text-zinc-600">
                Cuéntanos cómo trabaja tu taller y te decimos si CellFix te sirve, o qué módulos te convienen
                antes de empezar tu prueba.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
              <LeadForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} CellFix</p>
          <p>Sistema para talleres de reparación.</p>
        </div>
      </footer>
    </div>
  );
}
