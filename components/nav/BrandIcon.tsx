interface BrandIconProps {
  size?: number;
}

// Sthamly का आइकन: पोस्टर और चमक (बिना किसी अक्षर के)
export function BrandIcon({ size = 60 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sthamly"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="32" cy="32" r="32" fill="#e0561a" />

      {/* पोस्टर */}
      <rect x="19" y="16" width="26" height="32" rx="3.5" fill="#ffffff" />
      {/* फोटो वाला हिस्सा */}
      <rect x="24" y="21" width="16" height="12" rx="2" fill="#fdeee6" />
      {/* पंक्तियां (कैप्शन) */}
      <rect x="24" y="38" width="16" height="2.5" rx="1.25" fill="#e0561a" />
      <rect x="24" y="43" width="10" height="2.5" rx="1.25" fill="#e0561a" />

      {/* चमक का निशान */}
      <path
        d="M47 9 L48.4 13.6 L53 15 L48.4 16.4 L47 21 L45.6 16.4 L41 15 L45.6 13.6 Z"
        fill="#ffffff"
      />
    </svg>
  );
}