import 'package:flutter_test/flutter_test.dart';
import 'package:issue_gate_mobile/src/core/api/models.dart';
import 'package:issue_gate_mobile/src/core/sync/offline_queue.dart';

void main() {
  group('OfflineQueue', () {
    test('preserves FIFO order across distinct items', () {
      final queue = OfflineQueue();
      queue.enqueue(QueuedOperation(itemId: 'a', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'A')));
      queue.enqueue(QueuedOperation(itemId: 'b', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'B')));
      queue.enqueue(QueuedOperation(itemId: 'c', type: QueueOpType.delete, expectedRevision: 1));

      expect(queue.pending.map((o) => o.itemId).toList(), ['a', 'b', 'c']);
    });

    test('re-queuing the same itemId replaces the payload in place (idempotent, no duplicates)', () {
      final queue = OfflineQueue();
      queue.enqueue(QueuedOperation(itemId: 'a', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'first')));
      queue.enqueue(QueuedOperation(itemId: 'b', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'B')));
      queue.enqueue(QueuedOperation(itemId: 'a', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'latest')));

      expect(queue.pending, hasLength(2));
      expect(queue.pending.first.itemId, 'a');
      expect(queue.pending.first.data!.title, 'latest');
    });

    test('remove() drops only the matching item', () {
      final queue = OfflineQueue();
      queue.enqueue(QueuedOperation(itemId: 'a', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'A')));
      queue.enqueue(QueuedOperation(itemId: 'b', type: QueueOpType.upsert, expectedRevision: 0, data: const SecretData(title: 'B')));

      queue.remove('a');

      expect(queue.pending.map((o) => o.itemId).toList(), ['b']);
    });

    test('backoffFor is monotonically increasing and capped', () {
      final queue = OfflineQueue();
      final delays = List.generate(10, (i) => queue.backoffFor(i).inSeconds);

      for (var i = 1; i < delays.length; i++) {
        expect(delays[i], greaterThanOrEqualTo(delays[i - 1]));
      }
      expect(delays.last, lessThanOrEqualTo(64));
    });
  });
}
