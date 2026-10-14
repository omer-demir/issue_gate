interface BannerProps {
  tone: "info" | "warning" | "error";
  children: React.ReactNode;
}

/** aria-live region so async status (offline, pending-sync, errors) is announced. */
export function Banner({ tone, children }: BannerProps) {
  return (
    <div role="status" aria-live="polite" className={`banner banner--${tone}`}>
      {children}
    </div>
  );
}
