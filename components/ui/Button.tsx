import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  block?: boolean;
}

export function Button({
  children,
  variant = "primary",
  block = false,
  className = "",
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, block ? "btn-block" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}