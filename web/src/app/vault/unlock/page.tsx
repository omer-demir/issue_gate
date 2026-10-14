"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Banner } from "@/components/Banner";
import { useSession } from "@/store/SessionProvider";
import { useVault } from "@/store/VaultProvider";

/** MSM-5: vault unlock with the master password (web has no biometric API equivalent — n/a here). */
export default function VaultUnlockPage() {
  const { isAuthenticated } = useSession();
  const { status, checkBootstrap, unlock } = useVault();
  const router = useRouter();

  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) checkBootstrap();
  }, [isAuthenticated, checkBootstrap]);

  useEffect(() => {
    if (status === "not_provisioned") router.replace("/vault/setup");
    if (status === "unlocked") router.replace("/vault");
  }, [status, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await unlock(masterPassword);
      router.replace("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock your vault.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Unlock your vault</h1>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Master password"
          type="password"
          autoComplete="current-password"
          required
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      <p>
        Forgot your master password? <Link href="/vault/recover">Recover with your Recovery Kit</Link>
      </p>
    </>
  );
}
