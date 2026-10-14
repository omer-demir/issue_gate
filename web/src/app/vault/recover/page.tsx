"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Banner } from "@/components/Banner";
import { PasswordStrengthHint, estimatePasswordStrength, MIN_MASTER_PASSWORD_SCORE } from "@/components/PasswordStrength";
import { useVault } from "@/store/VaultProvider";

/** MSM-9: vault recovery via Recovery Kit when the master password is lost. */
export default function VaultRecoverPage() {
  const { recoverWithKit } = useVault();
  const router = useRouter();

  const [recoveryKey, setRecoveryKey] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setError(null);

    const { score } = estimatePasswordStrength(newMasterPassword);
    if (score < MIN_MASTER_PASSWORD_SCORE) {
      setFieldError("New master password is too weak. Address the suggestions below.");
      return;
    }
    if (newMasterPassword !== confirmPassword) {
      setFieldError("New master passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await recoverWithKit(recoveryKey.trim(), newMasterPassword);
      router.replace("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recover your vault.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Recover your vault</h1>
      <p>Enter the Recovery Kit key you saved when you created your vault, and choose a new master password.</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Recovery Kit key"
          type="text"
          required
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value)}
        />
        <FormField
          label="New master password"
          type="password"
          autoComplete="new-password"
          required
          value={newMasterPassword}
          error={fieldError ?? undefined}
          onChange={(e) => setNewMasterPassword(e.target.value)}
        />
        <PasswordStrengthHint password={newMasterPassword} />
        <FormField
          label="Confirm new master password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Recovering…" : "Recover vault"}
        </button>
      </form>
    </>
  );
}
