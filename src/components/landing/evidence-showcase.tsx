import { toString as qrToSvg } from "qrcode";

const photos = ["Frente", "Reverso", "Esquina", "Rayón en tapa", "Puerto de carga"];

const facts = [
  {
    term: "Sin app ni contraseña",
    detail: "Se escanea el código con el celular del mostrador y las fotos se toman desde el navegador.",
  },
  {
    term: "Enlace temporal y seguro",
    detail: "Cada código sirve para una sola orden y deja de funcionar por sí solo.",
  },
  {
    term: "Todas las fotos, junto a la orden",
    detail: "Pantalla, tapa, esquinas y cualquier golpe quedan guardados en la orden.",
  },
];

// Ilustración del flujo de evidencia: el QR en la pantalla del mostrador y el celular subiendo fotos.
export async function EvidenceShowcase() {
  const qr = await qrToSvg("CellFix · Orden #1042 · Evidencia fotográfica", {
    type: "svg",
    margin: 0,
    color: { dark: "#18181b", light: "#ffffff" },
  });

  return (
    <section id="evidencia" className="scroll-mt-16 border-b border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
            Fotos del equipo antes de tocarlo
          </h2>
          <p className="mt-4 max-w-lg text-zinc-600">
            Cuando un cliente dice <strong className="font-semibold text-zinc-900">&ldquo;así no venía&rdquo;</strong>, la
            respuesta ya está en la orden.
          </p>

          <dl className="mt-10 space-y-6">
            {facts.map((fact) => (
              <div key={fact.term} className="border-l-2 border-mat pl-4">
                <dt className="font-medium text-zinc-900">{fact.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-zinc-600">{fact.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div aria-hidden="true" className="relative mx-auto flex w-full max-w-md items-end justify-center gap-0 sm:justify-start">
          {/* Pantalla del mostrador con el código QR. */}
          <div className="w-52 shrink-0 rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:w-56">
            <p className="font-display text-[0.65rem] font-semibold tracking-[0.18em] text-zinc-500 uppercase [font-stretch:80%]">
              Orden #1042
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-900">Evidencia fotográfica</p>
            <div className="mt-4 aspect-square w-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-4 pr-8 text-xs leading-snug text-zinc-500 sm:pr-4">
              Escanea con tu celular
              <span className="block">para subir las fotos</span>
            </p>
          </div>

          {/* Celular con la página de subida. */}
          <div className="relative -ml-10 w-48 shrink-0 translate-y-8 rounded-[2rem] bg-zinc-900 p-2 shadow-[0_24px_48px_-16px_rgb(36_58_71/0.45)] sm:-ml-6 sm:w-52">
            <div className="rounded-[1.5rem] bg-white px-3.5 pt-6 pb-4">
              <p className="text-[0.6rem] font-medium tracking-wide text-zinc-500 uppercase">Taller El Chip</p>
              <p className="mt-0.5 font-display text-base font-bold tracking-tight">Evidencia</p>
              <p className="text-[0.7rem] text-zinc-500">iPhone 13 · #1042</p>
              <ul className="mt-3 grid grid-cols-2 gap-1.5">
                {photos.map((label, index) => (
                  <li
                    key={label}
                    className="relative flex aspect-square items-end overflow-hidden rounded-md bg-gradient-to-br from-zinc-200 to-zinc-300 p-1"
                  >
                    {/* Silueta del equipo en cada foto. */}
                    <span
                      className="absolute top-1/2 left-1/2 h-3/5 w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-[0.35rem] border-2 border-zinc-400/70"
                      style={{ rotate: `${(index % 3) * 8 - 8}deg` }}
                    />
                    <span className="relative rounded bg-white/85 px-1 text-[0.55rem] leading-tight text-zinc-700">
                      {label}
                    </span>
                  </li>
                ))}
                <li className="grid aspect-square place-items-center rounded-md border-2 border-dashed border-zinc-300 text-lg text-zinc-400">
                  +
                </li>
              </ul>
              <p className="mt-3 text-center text-[0.65rem] text-zinc-500">{photos.length} fotos subidas</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
