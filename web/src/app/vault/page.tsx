"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/Banner";
import { ConflictDialog } from "@/components/ConflictDialog";
import { useSession } from "@/store/SessionProvider";
import { useVault } from "@/store/VaultProvider";

/** MSM-6: vault list and view/copy a secret; MSM-14: offline/pending-sync indicators. */
export default function VaultListPage() {
  const { isAuthenticated, logout } = useSession();
  const { status, online, secrets, loading, error, conflict, checkBootstrap, loadSecrets, lock, resolveConflict } =
    useVault();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) checkBootstrap();
  }, [isAuthenticated, checkBootstrap]);

  useEffect(() => {
    if (status === "not_provisioned") router.replace("/vault/setup");
    if (status === "locked") router.replace("/vault/unlock");
    if (status === "unlocked") loadSecrets();
  }, [status, router, loadSecrets]);

  if (status !== "unlocked") return <p>Loading…</p>;

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Your secrets</h1>
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            lock();
            await logout();
            router.replace("/login");
          }}
        >
          Lock &amp; sign out
        </button>
      </header>

      {!online ? <Banner tone="warning">You are offline. New or edited secrets will sync once you reconnect.</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading ? (
        <p>Loading your secrets…</p>
      ) : secrets.length === 0 ? (
        <p>You have no secrets yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {secrets.map((secret) => (
            <li key={secret.itemId}>
              <Link href={`/vault/${secret.itemId}`} className="secret-card">
                <span>{secret.data.title || "Untitled"}</span>
                {secret.pendingSync ? <span className="secret-card__pending">Pending sync</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/vault/new">
        <button type="button">Add a secret</button>
      </Link>

      {conflict ? <ConflictDialog conflict={conflict} onResolve={resolveConflict} /> : null}
    </>
  );
}
