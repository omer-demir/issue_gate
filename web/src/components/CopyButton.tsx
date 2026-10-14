"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CLEAR_AFTER_MS = 30_000;

/** Copies a sensitive value and clears the clipboard after 30s (design handoff §clipboard copy). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === value) await navigator.clipboard.writeText("");
        } catch {
          // Clipboard read access may be denied; nothing further we can do.
        }
        setCopied(false);
      }, CLEAR_AFTER_MS);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <button type="button" onClick={handleCopy} aria-label={`Copy ${label}`}>
      {copied ? "Copied — clears in 30s" : `Copy ${label}`}
    </button>
  );
}
