interface BrandMarkProps {
  size?: number
  className?: string
}

export function BrandMark({ size = 30, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path
        d="M18 23.5h15M18 32h28M18 40.5h19"
        fill="none"
        stroke="#F7F3E8"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="46.5" cy="22.5" r="4.5" fill="#D28A5B" />
    </svg>
  )
}

export function Brand() {
  return (
    <div className="brand" aria-label="在办">
      <BrandMark size={30} className="brand__mark" />
      <span className="brand__name">在办</span>
      <span className="brand__latin">PRJM</span>
    </div>
  )
}
