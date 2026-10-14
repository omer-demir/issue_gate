"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { Banner } from "@/components/Banner";
import type { SecretData } from "@/store/VaultProvider";

interface SecretFormProps {
  initial?: SecretData;
  submitLabel: string;
  onSubmit: (data: SecretData) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function SecretForm({ initial, submitLabel, onSubmit, onDelete }: SecretFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTitleError(null);
    if (title.trim().length === 0) {
      setTitleError("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), username, password, url, notes });
    } catch {
      setError("Could not save this secret. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch {
      setError("Could not delete this secret. Please retry.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <FormField label="Title" required value={title} error={titleError ?? undefined} onChange={(e) => setTitle(e.target.value)} />
      <FormField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <FormField label="Password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
      <FormField label="Website URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="form-field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button type="submit" disabled={submitting || deleting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onDelete && !confirmingDelete ? (
          <button
            type="button"
            className="secondary"
            disabled={submitting || deleting}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        ) : null}
      </div>
      {onDelete && confirmingDelete ? (
        <div
          role="alertdialog"
          aria-labelledby="delete-confirm-heading"
          aria-describedby="delete-confirm-description"
          style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <p id="delete-confirm-heading" style={{ fontWeight: 600, margin: 0 }}>
            Delete this secret?
          </p>
          <p id="delete-confirm-description" style={{ margin: 0 }}>
            This action cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="secondary" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
