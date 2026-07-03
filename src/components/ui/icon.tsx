import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></>,
  chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
  flask: <><path d="M9 3h6M10 3v5l-5.5 9.2A2.5 2.5 0 0 0 6.7 21h10.6a2.5 2.5 0 0 0 2.2-3.8L14 8V3"/><path d="M7 15h10"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  bot: <><rect x="4" y="6" width="16" height="13" rx="3"/><path d="M12 2v4M8 11h.01M16 11h.01M8 15h8"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  move: <><path d="m12 2 3 3-3 3M12 2 9 5l3 3M12 22l3-3-3-3M12 22l-3-3 3-3M2 12l3-3 3 3M2 12l3 3 3-3M22 12l-3-3-3 3M22 12l-3 3-3-3"/><path d="M12 3v18M3 12h18"/></>,
};

export function Icon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
