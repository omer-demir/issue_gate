"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Banner } from "@/components/Banner";
import { ApiError } from "@/lib/api";
import { useSession } from "@/store/SessionProvider";

const MIN_LENGTH = 8;

export default function RegisterPage() {
  const { register } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    if (password.length < MIN_LENGTH) {
      setFieldError(`Account password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password);
      router.replace("/vault/setup");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("An account with this email already exists.");
      } else if (err instanceof ApiError && err.status === 0) {
        setError("You appear to be offline. Your details were not lost — please retry.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError((err.body as { message?: string })?.message ?? "Please check your details and try again.");
      } else {
        setError("Something went wrong creating your account. Please retry.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Create your account</h1>
      <p>
        This <strong>account password</strong> is separate from your vault&apos;s master password you&apos;ll set up
        next — resetting one never affects the other.
      </p>
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
          autoComplete="new-password"
          required
          value={password}
          error={fieldError ?? undefined}
          hint={`At least ${MIN_LENGTH} characters`}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormField
          label="Confirm account password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
