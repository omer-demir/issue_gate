"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Banner } from "@/components/Banner";
import { ApiError } from "@/lib/api";
import { useSession } from "@/store/SessionProvider";

export default function LoginPage() {
  const { login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/vault");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 0
          ? "You appear to be offline. Please check your connection and retry."
          : "Invalid account email or password."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <p>This is your <strong>account login</strong>, separate from your vault&apos;s master password.</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Account password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        New here? <Link href="/register">Create an account</Link>
      </p>
    </>
  );
}
