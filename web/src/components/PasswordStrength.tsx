"use client";

/**
 * Rough entropy-estimate strength check for the master password (MSM-4 AC2).
 * Client-side only — never a security boundary, just a usability guard.
 */
export function estimatePasswordStrength(password: string): { score: number; label: string; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  else reasons.push("Use at least 12 characters");

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else reasons.push("Mix upper and lower case letters");

  if (/\d/.test(password)) score += 1;
  else reasons.push("Add a number");

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else reasons.push("Add a symbol");

  const unique = new Set(password).size;
  if (unique < 6 && password.length > 0) reasons.push("Avoid repeating the same characters");

  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"];
  const label = labels[Math.min(score, labels.length - 1)] ?? "Very weak";
  return { score, label, reasons };
}

export const MIN_MASTER_PASSWORD_SCORE = 3;

export function PasswordStrengthHint({ password }: { password: string }) {
  const { label, reasons } = estimatePasswordStrength(password);
  return (
    <p className="form-field__hint" aria-live="polite">
      Strength: {label}
      {reasons.length > 0 ? ` — ${reasons.join("; ")}` : ""}
    </p>
  );
}
