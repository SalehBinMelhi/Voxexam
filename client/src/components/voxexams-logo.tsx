interface VoxExamsLogoProps {
  size?: number;
  className?: string;
}

export function VoxExamsLogo({ size = 32, className = "" }: VoxExamsLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#4C3AFF" />

      <path
        d="M18 18 C20 28, 24 38, 32 48 C40 38, 44 28, 46 18"
        stroke="#00C2FF"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      <path
        d="M13 20 C16 32, 22 42, 32 50 C42 42, 48 32, 51 20"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.3"
        fill="none"
      />

      <path
        d="M23 20 C24 26, 27 34, 32 42 C37 34, 40 26, 41 20"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.25"
        fill="none"
      />

      <circle cx="32" cy="48" r="4" fill="#00C2FF" />
      <circle cx="32" cy="48" r="2" fill="white" />
    </svg>
  );
}

interface VoxExamsWordmarkProps {
  className?: string;
}

export function VoxExamsWordmark({ className = "" }: VoxExamsWordmarkProps) {
  return (
    <span className={`text-lg tracking-tight ${className}`}>
      <span className="font-bold" style={{ color: "#4C3AFF" }}>Vox</span>
      <span className="font-medium text-foreground">Exams</span>
    </span>
  );
}
