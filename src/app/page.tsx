import { FaqAccordion } from "@/components/faq-accordion";
import { LeadForm } from "@/components/lead-form";

const devices = ["Celulares", "Tablets", "Televisores", "Laptops", "Teclados", "Consolas", "Componentes"];

const features = [
  {
    title: "Órdenes en un solo lugar",
    description: "Registra equipo, falla, accesorios y fotos al recibirlo. Cada orden con su folio único.",
  },
  {
    title: "Estados claros",
    description: "Recibido, en diagnóstico, en reparación, listo y entregado. Sin hojas de papel perdidas.",
  },
  {
    title: "Clientes y equipos",
    description: "Historial por cliente y por dispositivo: qué se reparó, cuándo y cuánto costó.",
  },
  {
    title: "Presupuestos y anticipos",
    description: "Cotiza, registra anticipos y conoce el saldo pendiente de cada orden.",
  },
  {
    title: "Avisos solo cuando importan",
    description: "Un correo al cliente cuando su equipo está listo. Nada de spam ni notificaciones de más.",
  },
  {
    title: "Para todo tu equipo",
    description: "Recepción, técnicos y administración con acceso a lo que cada uno necesita.",
  },
];

const steps = [
  { title: "Recibe", description: "Crea la orden en segundos con los datos del cliente y del equipo." },
  { title: "Repara", description: "Tu técnico actualiza el estado y registra piezas y notas." },
  { title: "Entrega", description: "El cliente recibe un aviso, liquida y la orden se cierra." },
];

const faqs = [
  {
    question: "¿Necesito instalar algo?",
    answer: "No. CellFix funciona desde el navegador en computadora, tablet o celular.",
  },
  {
    question: "¿Sirve si no reparo celulares?",
    answer: "Sí. Funciona para cualquier taller de electrónica: televisores, consolas, laptops, teclados y más.",
  },
  {
    question: "¿Cuándo estará disponible?",
    answer: "Estamos abriendo acceso anticipado. Déjanos tus datos y te escribimos cuando tengas tu lugar.",
  },
];

const sampleOrders = [
  { id: "#1042", device: "iPhone 13 · Pantalla", status: "Listo", tone: "bg-emerald-50 text-emerald-700" },
  { id: "#1041", device: "Samsung TV 55\" · Sin imagen", status: "En reparación", tone: "bg-amber-50 text-amber-700" },
  { id: "#1040", device: "iPad Air · Batería", status: "Diagnóstico", tone: "bg-zinc-100 text-zinc-600" },
  { id: "#1039", device: "Teclado mecánico · Switches", status: "Entregado", tone: "bg-zinc-100 text-zinc-400" },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="#" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-zinc-900 text-xs text-white">CF</span>
            CellFix
          </a>
          <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
            <a href="#funciones" className="hover:text-zinc-900">Funciones</a>
            <a href="#como-funciona" className="hover:text-zinc-900">Cómo funciona</a>
            <a href="#preguntas" className="hover:text-zinc-900">Preguntas</a>
          </nav>
          <a
            href="#contacto"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Solicitar acceso
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 md:py-28 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
              Acceso anticipado abierto
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Las órdenes de tu taller de reparación, en orden.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-zinc-600 text-pretty">
              CellFix es un sistema simple para recibir, dar seguimiento y entregar reparaciones de
              celulares, tablets, televisores y cualquier equipo electrónico.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#contacto"
                className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Quiero probarlo
              </a>
              <a
                href="#funciones"
                className="rounded-lg border border-zinc-200 px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                Ver funciones
              </a>
            </div>
          </div>

          {/* Vista previa ilustrativa del panel */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 shadow-sm" aria-hidden="true">
            <div className="rounded-xl border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
                <p className="text-sm font-medium">Órdenes de hoy</p>
                <span className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs text-white">+ Nueva</span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {sampleOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-zinc-400">{order.id}</p>
                      <p className="truncate text-sm text-zinc-800">{order.device}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${order.tone}`}>
                      {order.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Dispositivos */}
        <section className="border-y border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6 text-sm text-zinc-500">
            <span className="text-zinc-400">Para talleres que reparan</span>
            {devices.map((device) => (
              <span key={device} className="font-medium text-zinc-700">{device}</span>
            ))}
          </div>
        </section>

        {/* Funciones */}
        <section id="funciones" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Lo necesario, nada de más</h2>
            <p className="mt-4 text-zinc-600">
              Diseñado para el día a día del mostrador y del banco de trabajo.
            </p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="bg-white p-8">
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="scroll-mt-16 bg-zinc-900 text-white">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <h2 className="text-3xl font-semibold tracking-tight">Cómo funciona</h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="font-mono text-sm text-zinc-500">0{index + 1}</span>
                  <h3 className="mt-3 text-xl font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-16 px-6 py-24">
          <h2 className="text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <FaqAccordion items={faqs} />
        </section>

        {/* Contacto */}
        <section id="contacto" className="scroll-mt-16 border-t border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">¿Te interesa CellFix?</h2>
              <p className="mt-4 text-zinc-600">
                Cuéntanos sobre tu taller y te daremos acceso anticipado con acompañamiento para
                configurarlo.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
              <LeadForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-zinc-500 sm:flex-row">
          <p>© {new Date().getFullYear()} CellFix</p>
          <p>Gestión de órdenes para talleres de reparación.</p>
        </div>
      </footer>
    </>
  );
}
