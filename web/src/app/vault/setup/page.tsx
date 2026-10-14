"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Banner } from "@/components/Banner";
import { PasswordStrengthHint, estimatePasswordStrength, MIN_MASTER_PASSWORD_SCORE } from "@/components/PasswordStrength";
import { useSession } from "@/store/SessionProvider";
import { useVault } from "@/store/VaultProvider";

/** MSM-4 (create vault + master password) + MSM-8 (Recovery Kit generation/display). */
export default function VaultSetupPage() {
  const { isAuthenticated } = useSession();
  const { status, checkBootstrap, setupVault } = useVault();
  const router = useRouter();

  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) checkBootstrap();
  }, [isAuthenticated, checkBootstrap]);

  useEffect(() => {
    if (status === "locked" || status === "unlocked") router.replace(status === "unlocked" ? "/vault" : "/vault/unlock");
  }, [status, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setError(null);

    const { score } = estimatePasswordStrength(masterPassword);
    if (score < MIN_MASTER_PASSWORD_SCORE) {
      setFieldError("Master password is too weak. Address the suggestions below.");
      return;
    }
    if (masterPassword !== confirmPassword) {
      setFieldError("Master passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const result = await setupVault(masterPassword);
      setRecoveryKey(result.recoveryKey);
    } catch {
      setError("Could not create your vault. Your master password was not sent anywhere — please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryKey) {
    return (
      <>
        <h1>Save your Recovery Kit</h1>
        <Banner tone="warning">
          This is the <strong>only</strong> way to recover your vault if you forget your master password. It is
          never sent to our servers and cannot be re-displayed.
        </Banner>
        <p className="recovery-key" aria-label="Recovery key">
          {recoveryKey}
        </p>
        <FormField
          label="I have securely saved my Recovery Kit"
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <button type="button" disabled={!acknowledged} onClick={() => router.replace("/vault")}>
          Continue to my vault
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Create your vault</h1>
      <p>
        Your <strong>master password</strong> encrypts your secrets on this device before anything is sent anywhere.
        It is never recoverable by resetting your account password.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Master password"
          type="password"
          autoComplete="new-password"
          required
          value={masterPassword}
          error={fieldError ?? undefined}
          onChange={(e) => setMasterPassword(e.target.value)}
        />
        <PasswordStrengthHint password={masterPassword} />
        <FormField
          label="Confirm master password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating vault…" : "Create vault"}
        </button>
      </form>
    </>
  );
}
