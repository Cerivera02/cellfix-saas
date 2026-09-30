import { Archivo, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

// Tipografías de las páginas públicas (landing y login). El dashboard usa Geist.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const brandFonts = `${archivo.variable} ${instrument.variable} ${plexMono.variable}`;
