import '../api/models.dart';

enum QueueOpType { upsert, delete }

/// A locally-queued pending write (MSM-14). In-memory only: cleared on
/// process death by design, so no plaintext secret ever touches disk
/// unencrypted. The UI's pending-sync badge communicates this to the user;
/// a reload after returning online re-attempts any items still pending in
/// the live session (see VaultRepository._drainQueue). Persisting the queue
/// itself (encrypted) across process death is a tracked follow-up, not an
/// MVP requirement.
class QueuedOperation {
  QueuedOperation({
    required this.itemId,
    required this.type,
    required this.expectedRevision,
    this.data,
    DateTime? queuedAt,
  }) : queuedAt = queuedAt ?? DateTime.now();

  final String itemId;
  final QueueOpType type;
  final int expectedRevision;
  final SecretData? data;
  final DateTime queuedAt;
  int attempts = 0;
}

/// FIFO-by-first-queued-item offline write queue with idempotent replace
/// semantics: re-queuing the same `itemId` while still pending updates the
/// payload in place rather than duplicating the operation, so replay stays
/// idempotent no matter how many local edits happened while offline.
class OfflineQueue {
  final List<QueuedOperation> _ops = [];

  List<QueuedOperation> get pending => List.unmodifiable(_ops);

  void enqueue(QueuedOperation op) {
    final idx = _ops.indexWhere((o) => o.itemId == op.itemId);
    if (idx == -1) {
      _ops.add(op);
    } else {
      _ops[idx] = op;
    }
  }

  void remove(String itemId) {
    _ops.removeWhere((o) => o.itemId == itemId);
  }

  void clear() => _ops.clear();

  /// Capped exponential backoff: 1s, 2s, 4s, ... up to 64s.
  Duration backoffFor(int attempts) {
    final capped = attempts.clamp(0, 6);
    return Duration(seconds: 1 << capped);
  }
}
