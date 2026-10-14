"use client";

import { useRouter } from "next/navigation";
import { SecretForm } from "@/components/SecretForm";
import { ConflictDialog } from "@/components/ConflictDialog";
import { useVault } from "@/store/VaultProvider";

/** MSM-7: create a secret (local-only envelope, synced via MSM-14's writeSecret). */
export default function NewSecretPage() {
  const router = useRouter();
  const { createSecret, conflict, resolveConflict } = useVault();

  return (
    <>
      <h1>Add a secret</h1>
      <SecretForm
        submitLabel="Save"
        onSubmit={async (data) => {
          await createSecret(data);
          router.replace("/vault");
        }}
      />
      {conflict ? <ConflictDialog conflict={conflict} onResolve={resolveConflict} /> : null}
    </>
  );
}
