/**
 * Inline SVG ikonlar — kutubxonasiz, stroke: currentColor.
 * Hammasi dekorativ (aria-hidden) — matn yorlig'i yonida ishlatiladi.
 */

function Svg({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
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
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ChartIcon = () => (
  <Svg>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M7 13l3-3 3 2 5-6" />
  </Svg>
);

export const UsersIcon = () => (
  <Svg>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M17.5 15.2c2 .6 3.5 2.2 4 4.8" />
  </Svg>
);

export const ShieldIcon = () => (
  <Svg>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
    <path d="M9.5 12l2 2 3.5-4" />
  </Svg>
);

export const ListIcon = () => (
  <Svg>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="2.4" />
  </Svg>
);

export const LogoutIcon = () => (
  <Svg>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const MenuIcon = () => (
  <Svg>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const CalendarIcon = () => (
  <Svg size={16}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17" />
    <path d="M8 2.5V6M16 2.5V6" />
  </Svg>
);

export const ChevronDownIcon = () => (
  <Svg size={14}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
