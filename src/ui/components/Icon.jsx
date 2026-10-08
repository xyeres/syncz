const PATHS = {
  dashboard: <><rect x="3" y="3" width="8" height="10" /><rect x="13" y="3" width="8" height="6" /><rect x="13" y="11" width="8" height="10" /><rect x="3" y="15" width="8" height="6" /></>,
  splits: <><rect x="3" y="5" width="18" height="6" /><path d="M10 5v6M15 5v6" /><rect x="3" y="14" width="18" height="6" /><path d="M8 14v6" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.8 3 2.5 3.5 5.2" /></>,
  report: <><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4M8 12h8M8 16h8M8 8h4" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  close: <path d="M5 5l14 14M19 5L5 19" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
  arrowLeft: <path d="M20 12H5M11 5l-7 7 7 7" />,
  arrowRight: <path d="M4 12h15M13 5l7 7-7 7" />,
  download: <><path d="M12 3v12M6 10l6 6 6-6" /><path d="M4 20h16" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3.6-3.6a4 4 0 0 0-5.7-5.7L12 6.3" /><path d="M14 10a4 4 0 0 0-5.7 0l-3.6 3.6a4 4 0 0 0 5.7 5.7l1.6-1.6" /></>,
  logout: <><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 21v-5h-5" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
}

export default function Icon({ name, size = 20, stroke = 2, className, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

export function YouTubeMark({ size = 22 }) {
  return (
    <svg width={size} height={(size * 20) / 28} viewBox="0 0 28 20" aria-hidden="true" focusable="false">
      <rect width="28" height="20" rx="5" fill="#FF0000" />
      <path d="M11.2 5.8v8.4l7.2-4.2z" fill="#fff" />
    </svg>
  )
}
