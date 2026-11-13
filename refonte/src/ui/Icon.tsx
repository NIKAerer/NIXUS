/** Icônes au trait, dessinées sur une grille de 20. Une seule source pour toute l'interface. */
const PATHS = {
  home: "M3 9.5 10 3l7 6.5V17h-4.5v-4.5h-5V17H3z",
  grind: "M3 16l4.5-5 3 2.5L17 5m0 0h-4m4 0v4",
  collection: "M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v4H3zM11 12h6v4h-6z",
  loot: "M3 8h14v9H3zM2 5h16v3H2zM10 5v12M7 5c-2-3 2-4 3 0 1-4 5-3 3 0",
  profile: "M10 10a3.6 3.6 0 1 0 0-7.2A3.6 3.6 0 0 0 10 10Zm-6.5 7.2c.5-3.2 3.200-5 6.5-5s6 1.800 6.500 5",
  friends: "M7.500 9.500a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.500 7c.4-2.800 2.700-4.500 5.500-4.500s5.100 1.700 5.500 4.500M13.500 9a2.500 2.500 0 1 0-.8-4.900M15 12.300c1.700.5 2.800 1.900 3 4.200",
  settings: "M10 12.600a2.600 2.600 0 1 0 0-5.200 2.600 2.600 0 0 0 0 5.200Zm6.200-2.600 1.500-1.200-1.500-2.600-1.800.7a5.500 5.500 0 0 0-1.300-.8L12.800 4.200H9.800l-.3 1.900c-.5.2-.900.5-1.300.8l-1.800-.7L4.900 8.800 6.400 10l-1.500 1.200 1.500 2.600 1.800-.7c.4.3.8.6 1.300.8l.3 1.900h3l.3-1.900c.5-.2.900-.5 1.300-.8l1.800.7 1.500-2.600z",
  refresh: "M16.500 10a6.500 6.500 0 1 1-2-4.700M16.500 3v3.500H13",
  close: "M5 5l10 10M15 5 5 15",
  play: "M6 4l10 6-10 6z",
  plus: "M10 4v12M4 10h12",
  chat: "M3 4h14v9H8l-4 3.500V13H3z",
  back: "M12 4 6 10l6 6",
  chevron: "M5 8l5 5 5-5",
  search: "M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12Zm4.500-1.500L17 17",
  swap: "M4 7h11l-3-3M16 13H5l3 3",
  history: "M10 3.500a6.500 6.500 0 1 1-6.100 4.300M3.500 4v3.800h3.800M10 6.500V10l2.500 1.600",
  flag: "M5 18V3m0 1h9l-2 3.500L14 11H5",
  shield: "M10 2 3 5v5c0 4 3 7 7 8 4-1 7-4 7-8V5l-7-3Zm-3 8 2 2 4-4",
  crown: "M3 15h14l1-8-4.500 3L10 4 6.500 10 2 7z",
  pen: "M3 14.500V17h2.500l8.600-8.600-2.500-2.500L3 14.500Zm11.800-9.300 1.300 1.300",
  star: "M10 2.500l2.300 4.800 5.200.7-3.800 3.600.9 5.200L10 14.300l-4.600 2.500.9-5.200L2.500 8l5.200-.7z",
  dice: "M4 4h12v12H4zM7.500 7.500h0M12.500 12.500h0M12.500 7.500h0M7.500 12.500h0",
  exit: "M8 3H4v14h4M12 6l4 4-4 4M16 10H8",
  dots: "M5 10h0M10 10h0M15 10h0",
  users: "M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8c.5-3 3-4.500 6-4.500s5.500 1.500 6 4.500",
  eye: "M2 10s3-5.500 8-5.500S18 10 18 10s-3 5.500-8 5.500S2 10 2 10Zm8 2.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5Z",
  bolt: "M11 2 4 11.500h5L8 18l8-10h-5.500z",
  min: "M4 10h12",
  max: "M4.500 4.500h11v11h-11z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, fill, className }: { name: IconName; size?: number; fill?: boolean; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
