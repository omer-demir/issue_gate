"use client";

import { useId, type InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

/** Labelled input with an id-linked error message for screen readers (aria-describedby). */
export function FormField({ label, error, hint, id, ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="form-field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} aria-describedby={describedBy} aria-invalid={Boolean(error)} {...inputProps} />
      {hint ? (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="form-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
