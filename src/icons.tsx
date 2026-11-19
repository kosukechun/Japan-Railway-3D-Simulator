const paths = {
  train:
    "M5 15V6q0-3 3-3h8q3 0 3 3v9q0 3-3 3H8q-3 0-3-3ZM5 10h14M9 3v7m-1 5h1m6 0h1M8 18l-3 4m11-4 3 4M7 20h10",
  routes: "M5 5h13l-4-4m4 4-4 4M19 19H6l4-4m-4 4 4 4",
  swap: "M7 4v15l-3-3m3 3 3-3m7 4V5l-3 3m3-3 3 3",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  map: "m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3zm6-3v17m8-14v17",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 6v6l4 2",
  layers: "m2 8 10-6 10 6-10 6zM2 12l10 6 10-6M2 16l10 6 10-6",
  panel: "M3 4h18v16H3zM9 4v16",
  close: "m6 6 12 12m0-12L6 18",
  play: "m7 4 13 8-13 8z",
  pause: "M8 4v16m8-16v16",
  previous: "m17 5-10 7 10 7zM4 5v14",
  next: "m7 5 10 7-10 7zM20 5v14",
  end: "m3 5 10 7-10 7zm11 0 8 7-8 7z",
  reset: "M3 10a9 9 0 1 1 2 8M3 3v7h7",
  expand: "M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-10v1",
  camera: "M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  pin: "M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0zM14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  chevron: "m9 5 7 7-7 7",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  link: "m10 14 4-4m-6 2-2 2a3.5 3.5 0 0 0 5 5l3-3m-4-8 3-3a3.5 3.5 0 0 1 5 5l-2 2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1",
  location: "m2 11 20-9-9 20-2-9z",
};
export function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof paths;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export type IconName = keyof typeof paths;
