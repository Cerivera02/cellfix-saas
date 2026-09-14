"use client";

import { useId, useState } from "react";

type Faq = { question: string; answer: string };

export function FaqAccordion({ items }: { items: Faq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  return (
    <div className="mt-10 divide-y divide-zinc-200 border-y border-zinc-200">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const buttonId = `${baseId}-button-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <div key={item.question}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left font-medium"
              >
                {item.question}
                <span
                  aria-hidden="true"
                  className={`text-xl leading-none text-zinc-400 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                    isOpen ? "rotate-45 text-zinc-900" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!isOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p
                  className={`pb-5 text-sm leading-relaxed text-zinc-600 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                    isOpen ? "translate-y-0" : "-translate-y-1"
                  }`}
                >
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
