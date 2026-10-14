"use client";

import type { ConflictState } from "@/store/VaultProvider";

interface ConflictDialogProps {
  conflict: ConflictState;
  onResolve: (choice: "mine" | "theirs") => void;
}

/** MSM-15: 409 version_conflict surfaced side-by-side; no silent overwrite or auto-merge. */
export function ConflictDialog({ conflict, onResolve }: ConflictDialogProps) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="conflict-title" className="conflict-dialog">
      <h2 id="conflict-title">This secret changed on another device</h2>
      <p>Choose which version to keep. The other version will be discarded.</p>
      <div className="conflict-dialog__columns">
        <section aria-label="Your version">
          <h3>Your version</h3>
          <dl>
            <dt>Title</dt>
            <dd>{conflict.yourData.title}</dd>
            <dt>Username</dt>
            <dd>{conflict.yourData.username || "—"}</dd>
          </dl>
        </section>
        <section aria-label="Server version">
          <h3>Other device&apos;s version</h3>
          {conflict.serverData ? (
            <dl>
              <dt>Title</dt>
              <dd>{conflict.serverData.title}</dd>
              <dt>Username</dt>
              <dd>{conflict.serverData.username || "—"}</dd>
            </dl>
          ) : (
            <p>This secret was deleted on another device.</p>
          )}
        </section>
      </div>
      <div className="conflict-dialog__actions">
        <button type="button" onClick={() => onResolve("mine")}>
          Keep my version
        </button>
        <button type="button" onClick={() => onResolve("theirs")}>
          Keep the other version
        </button>
      </div>
    </div>
  );
}
