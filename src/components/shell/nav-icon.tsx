const PATHS = {
  store: ["M4 10v10h16V10", "M3 4h18l-1.5 6h-15z", "M10 20v-5h4v5"],
  home: ["M3 11l9-7 9 7", "M5 10v10h14V10", "M10 20v-6h4v6"],
  users: [
    "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M22 20v-1a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "M9 12l2 2 4-4"],
  box: ["M21 8l-9-5-9 5 9 5 9-5z", "M3 8v8l9 5 9-5V8", "M12 13v8"],
  chevron: ["M9 6l6 6-6 6"],
  cash: ["M3 7h18v10H3z", "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", "M6 10v4", "M18 10v4"],
  wrench: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"],
  user: ["M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  logout: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 17l-5-5 5-5", "M5 12h11"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
} as const;

export type IconName = keyof typeof PATHS;

export function NavIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
