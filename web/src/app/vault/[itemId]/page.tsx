"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SecretForm } from "@/components/SecretForm";
import { ConflictDialog } from "@/components/ConflictDialog";
import { Banner } from "@/components/Banner";
import { CopyButton } from "@/components/CopyButton";
import { useVault } from "@/store/VaultProvider";

/** MSM-6/7: view/copy and edit/delete a single secret. */
export default function SecretDetailPage() {
  const params = useParams<{ itemId: string }>();
  const router = useRouter();
  const { status, secrets, getSecret, updateSecret, deleteSecret, conflict, resolveConflict, loadSecrets } = useVault();

  const itemId = params.itemId;
  const secret = getSecret(itemId);

  useEffect(() => {
    if (status === "unlocked" && secrets.length === 0) loadSecrets();
  }, [status, secrets.length, loadSecrets]);

  if (status !== "unlocked") return <p>Loading…</p>;
  if (!secret) return <Banner tone="error">This secret could not be found.</Banner>;

  return (
    <>
      <h1>{secret.data.title}</h1>
      {secret.data.password ? <CopyButton value={secret.data.password} label="password" /> : null}
      <SecretForm
        initial={secret.data}
        submitLabel="Save changes"
        onSubmit={async (data) => {
          await updateSecret(itemId, data);
          router.replace("/vault");
        }}
        onDelete={async () => {
          await deleteSecret(itemId);
          router.replace("/vault");
        }}
      />
      {conflict ? <ConflictDialog conflict={conflict} onResolve={resolveConflict} /> : null}
    </>
  );
}
