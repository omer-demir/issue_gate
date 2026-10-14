import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../crypto/crypto_core.dart';
import '../storage/secure_store.dart';
import '../sync/offline_queue.dart';

enum VaultStatus { checking, notProvisioned, locked, unlocked }

class SecretEntry {
  const SecretEntry({required this.itemId, required this.revision, required this.data, required this.pendingSync});

  final String itemId;
  final int revision;
  final SecretData data;
  final bool pendingSync;
}

class ConflictState {
  const ConflictState({
    required this.itemId,
    required this.yourData,
    required this.yourExpectedRevision,
    required this.serverRevision,
    required this.serverData,
    required this.isNew,
  });

  final String itemId;
  final SecretData yourData;
  final int yourExpectedRevision;
  final int serverRevision;
  final SecretData? serverData;
  final bool isNew;
}

const incorrectPasswordMessage = 'Incorrect master password, or Recovery Kit is for a different vault.';

/// MSM-4..MSM-9, MSM-14/15 (mobile realization): vault lifecycle, local
/// secrets cache, and the offline queue. Mirrors
/// web/src/store/VaultProvider.tsx's contract; independently implemented in
/// Dart per ADR-0005 (no shared source between platforms).
class VaultRepository extends ChangeNotifier {
  VaultRepository({
    required ApiClient apiClient,
    required SecureStore secureStore,
    required OfflineQueue offlineQueue,
    Connectivity? connectivity,
  })  : _api = apiClient,
        _secureStore = secureStore,
        _queue = offlineQueue,
        _connectivity = connectivity ?? Connectivity() {
    _connectivitySub = _connectivity.onConnectivityChanged.listen((results) {
      final isOnline = !results.contains(ConnectivityResult.none);
      if (isOnline != _online) {
        _online = isOnline;
        notifyListeners();
        if (_online) unawaited(_drainQueue());
      }
    });
  }

  final ApiClient _api;
  final SecureStore _secureStore;
  final OfflineQueue _queue;
  final Connectivity _connectivity;
  late final StreamSubscription<List<ConnectivityResult>> _connectivitySub;

  String? _accessToken;
  SecretKey? _dek;

  VaultStatus status = VaultStatus.checking;
  bool _online = true;
  bool get online => _online;
  List<SecretEntry> secrets = [];
  bool loading = false;
  String? error;
  ConflictState? conflict;

  /// True once [setupVault] has unwrapped a DEK but before the user has
  /// acknowledged saving their Recovery Kit (MSM-8 AC). The vault screen
  /// gates on this instead of [status] so the Recovery Kit confirmation
  /// step can never be skipped by an unrelated rebuild.
  bool recoveryKitPendingAck = false;

  List<QueuedOperation> get pendingOperations => _queue.pending;

  void attachSession(String accessToken) {
    _accessToken = accessToken;
  }

  String _requireToken() {
    final token = _accessToken;
    if (token == null) throw StateError('Not authenticated');
    return token;
  }

  SecretKey _requireDek() {
    final dek = _dek;
    if (dek == null) throw StateError('Vault is locked');
    return dek;
  }

  Future<void> checkBootstrap() async {
    status = VaultStatus.checking;
    error = null;
    notifyListeners();
    try {
      final token = _requireToken();
      final bootstrap = await _api.vaultBootstrap(token);
      status = bootstrap.provisioned ? VaultStatus.locked : VaultStatus.notProvisioned;
    } on ApiException catch (e) {
      error = e.status == 0 ? 'You appear to be offline.' : 'Could not reach the server.';
      status = VaultStatus.notProvisioned;
    }
    notifyListeners();
  }

  /// Provisions the vault and returns the one-time-displayable Recovery
  /// Kit key. Leaves [status] at `notProvisioned` and sets
  /// [recoveryKitPendingAck] so the UI keeps showing the Recovery Kit until
  /// [confirmRecoveryKitSaved] is called — status only flips to `unlocked`
  /// then (MSM-8: the kit "cannot be re-displayed", so it must not be
  /// skippable by an unrelated rebuild).
  Future<String> setupVault(String masterPassword) async {
    final token = _requireToken();
    final masterSalt = generateSaltB64();
    const kdfParamsValue = KdfParams(algo: 'PBKDF2-SHA256', iterations: pbkdf2Iterations);
    await _api.vaultSetup(token, salt: masterSalt, kdfParams: kdfParamsValue, kdfParamsVersion: kdfParamsVersion);

    final dek = await generateDek();
    final masterKey = await deriveMasterKey(masterPassword, masterSalt, kdfParamsValue);
    final wrappedDekByMaster = await wrapDek(dek, masterKey);

    final recoveryKey = generateRecoveryKey();
    final recoverySalt = generateSaltB64();
    final recoveryWrapKey = await deriveRecoveryKey(recoveryKey, recoverySalt);
    final wrappedDekByRecovery = await wrapDek(dek, recoveryWrapKey);

    final payload = VaultMetaPayload(
      masterSalt: masterSalt,
      kdfParams: kdfParamsValue,
      wrappedDekByMaster: wrappedDekByMaster,
      recoverySalt: recoverySalt,
      wrappedDekByRecovery: wrappedDekByRecovery,
    );
    await _api.upsertItem(
      token,
      vaultMetaItemId,
      expectedRevision: 0,
      ciphertext: base64Encode(utf8.encode(jsonEncode(payload.toJson()))),
      nonce: 'n/a',
      algo: vaultMetaAlgo,
      schemaVersion: 1,
    );

    _dek = dek;
    secrets = [];
    recoveryKitPendingAck = true;
    notifyListeners();
    return recoveryKey;
  }

  /// Called once the user has confirmed they saved the Recovery Kit.
  void confirmRecoveryKitSaved() {
    recoveryKitPendingAck = false;
    status = VaultStatus.unlocked;
    notifyListeners();
  }

  Future<VaultMetaPayload> _fetchVaultMeta(String token) async {
    final item = await _api.getItem(token, vaultMetaItemId);
    final ciphertext = item.ciphertext;
    if (ciphertext == null) throw StateError('Vault metadata is missing');
    final decoded = jsonDecode(utf8.decode(base64Decode(ciphertext))) as Map<String, dynamic>;
    return VaultMetaPayload.fromJson(decoded);
  }

  Future<void> unlock(String masterPassword) async {
    final token = _requireToken();
    error = null;
    try {
      final meta = await _fetchVaultMeta(token);
      final masterKey = await deriveMasterKey(masterPassword, meta.masterSalt, meta.kdfParams);
      final dek = await unwrapDek(meta.wrappedDekByMaster, masterKey);
      _dek = dek;
      status = VaultStatus.unlocked;
      await _secureStore.cacheBiometricDek(base64Encode(await dek.extractBytes()));
    } catch (_) {
      // AES-GCM tag check failure (wrong password) and any other unlock
      // failure surface the same generic message (MSM-5 AC2: no hint).
      throw StateError(incorrectPasswordMessage);
    } finally {
      notifyListeners();
    }
  }

  /// MSM-3: biometric re-unlock convenience. Never bypasses the master
  /// password for the device's *first* unlock; only restores a
  /// previously-cached DEK after a fresh biometric prompt (see
  /// ui/screens/vault_unlock_screen.dart for the `local_auth` gate).
  Future<bool> tryBiometricUnlock() async {
    final cached = await _secureStore.readBiometricDek();
    if (cached == null) return false;
    _dek = secretKeyFromBytes(base64Decode(cached));
    status = VaultStatus.unlocked;
    notifyListeners();
    return true;
  }

  Future<void> recoverWithKit(String recoveryKey, String newMasterPassword) async {
    final token = _requireToken();
    final meta = await _fetchVaultMeta(token);
    SecretKey dek;
    try {
      final recoveryWrapKey = await deriveRecoveryKey(recoveryKey, meta.recoverySalt);
      dek = await unwrapDek(meta.wrappedDekByRecovery, recoveryWrapKey);
    } catch (_) {
      throw StateError('Recovery Kit key did not match this vault.');
    }

    final newMasterKey = await deriveMasterKey(newMasterPassword, meta.masterSalt, meta.kdfParams);
    final wrappedDekByMaster = await wrapDek(dek, newMasterKey);
    final nextPayload = meta.copyWith(wrappedDekByMaster: wrappedDekByMaster);

    final current = await _api.getItem(token, vaultMetaItemId);
    await _api.upsertItem(
      token,
      vaultMetaItemId,
      expectedRevision: current.revision,
      ciphertext: base64Encode(utf8.encode(jsonEncode(nextPayload.toJson()))),
      nonce: 'n/a',
      algo: vaultMetaAlgo,
      schemaVersion: 1,
    );

    _dek = dek;
    status = VaultStatus.unlocked;
    notifyListeners();
  }

  void lock() {
    _dek = null;
    secrets = [];
    status = VaultStatus.locked;
    notifyListeners();
  }

  Future<void> logout() async {
    _dek = null;
    _accessToken = null;
    secrets = [];
    _queue.clear();
    recoveryKitPendingAck = false;
    status = VaultStatus.checking;
    await _secureStore.clearBiometricDek();
    notifyListeners();
  }

  Future<void> loadSecrets() async {
    final token = _requireToken();
    final dek = _requireDek();
    loading = true;
    error = null;
    notifyListeners();
    try {
      final page = await _api.getChanges(token, cursor: 0);
      final decrypted = <SecretEntry>[];
      for (final item in page.items) {
        if (item.itemId == vaultMetaItemId || item.deletedAt != null || item.ciphertext == null || item.nonce == null) {
          continue;
        }
        try {
          final data = await decryptJson(item.ciphertext!, item.nonce!, dek);
          decrypted.add(SecretEntry(
            itemId: item.itemId,
            revision: item.revision,
            data: SecretData.fromJson(data as Map<String, dynamic>),
            pendingSync: false,
          ));
        } catch (_) {
          // Skip items this DEK cannot decrypt rather than surfacing garbage.
        }
      }
      // Re-apply any locally-queued pending edits so the pending badge and
      // optimistic content survive a reload while offline.
      for (final op in _queue.pending) {
        final idx = decrypted.indexWhere((s) => s.itemId == op.itemId);
        if (op.type == QueueOpType.delete) {
          decrypted.removeWhere((s) => s.itemId == op.itemId);
          continue;
        }
        final entry = SecretEntry(itemId: op.itemId, revision: op.expectedRevision, data: op.data!, pendingSync: true);
        if (idx == -1) {
          decrypted.add(entry);
        } else {
          decrypted[idx] = entry;
        }
      }
      secrets = decrypted;
    } on ApiException catch (e) {
      error =
          e.status == 0 ? 'You are offline. Showing the last synced secrets.' : 'Could not load your secrets. Please retry.';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  SecretEntry? getSecret(String itemId) {
    for (final s in secrets) {
      if (s.itemId == itemId) return s;
    }
    return null;
  }

  void _upsertLocal(SecretEntry entry) {
    final idx = secrets.indexWhere((s) => s.itemId == entry.itemId);
    if (idx == -1) {
      secrets = [...secrets, entry];
    } else {
      secrets = [...secrets]..[idx] = entry;
    }
    notifyListeners();
  }

  Future<void> _writeSecret(String itemId, SecretData data, int expectedRevision, bool isNew) async {
    final token = _requireToken();
    final dek = _requireDek();

    if (!_online) {
      // MSM-14: queue optimistically and surface a pending-sync badge instead of blocking the UI.
      _queue.enqueue(QueuedOperation(
        itemId: itemId,
        type: QueueOpType.upsert,
        expectedRevision: expectedRevision,
        data: data,
      ));
      _upsertLocal(SecretEntry(itemId: itemId, revision: expectedRevision, data: data, pendingSync: true));
      return;
    }

    final envelope = await encryptJson(data.toJson(), dek);
    try {
      final item = await _api.upsertItem(
        token,
        itemId,
        expectedRevision: expectedRevision,
        ciphertext: envelope.ciphertext,
        nonce: envelope.nonce,
        algo: envelope.algo,
        schemaVersion: envelope.schemaVersion,
      );
      _upsertLocal(SecretEntry(itemId: itemId, revision: item.revision, data: data, pendingSync: false));
    } on ApiException catch (e) {
      if (e.status == 409) {
        final body = e.body;
        Map<String, dynamic>? serverItemJson;
        if (body is Map && body['serverItem'] is Map) {
          serverItemJson = (body['serverItem'] as Map).cast<String, dynamic>();
        }
        SecretData? serverData;
        var serverRevision = expectedRevision;
        if (serverItemJson != null) {
          serverRevision = serverItemJson['revision'] as int? ?? expectedRevision;
          final cipher = serverItemJson['ciphertext'] as String?;
          final nonce = serverItemJson['nonce'] as String?;
          if (cipher != null && nonce != null) {
            try {
              serverData = SecretData.fromJson(await decryptJson(cipher, nonce, dek) as Map<String, dynamic>);
            } catch (_) {
              serverData = null;
            }
          }
        }
        conflict = ConflictState(
          itemId: itemId,
          yourData: data,
          yourExpectedRevision: expectedRevision,
          serverRevision: serverRevision,
          serverData: serverData,
          isNew: isNew,
        );
        notifyListeners();
        return;
      }
      rethrow;
    }
  }

  Future<void> createSecret(SecretData data) async {
    final itemId = const Uuid().v4();
    await _writeSecret(itemId, data, 0, true);
  }

  Future<void> updateSecret(String itemId, SecretData data) async {
    final current = getSecret(itemId);
    await _writeSecret(itemId, data, current?.revision ?? 0, false);
  }

  Future<void> deleteSecret(String itemId) async {
    final token = _requireToken();
    final current = getSecret(itemId);
    final expectedRevision = current?.revision ?? 0;

    if (!_online) {
      _queue.enqueue(QueuedOperation(itemId: itemId, type: QueueOpType.delete, expectedRevision: expectedRevision));
      secrets = secrets.where((s) => s.itemId != itemId).toList();
      notifyListeners();
      return;
    }

    try {
      await _api.deleteItem(token, itemId, expectedRevision);
      secrets = secrets.where((s) => s.itemId != itemId).toList();
      notifyListeners();
    } on ApiException catch (e) {
      if (e.status == 409) {
        conflict = ConflictState(
          itemId: itemId,
          yourData: current?.data ?? const SecretData(title: ''),
          yourExpectedRevision: expectedRevision,
          serverRevision: expectedRevision,
          serverData: null,
          isNew: false,
        );
        notifyListeners();
        return;
      }
      rethrow;
    }
  }

  Future<void> resolveConflict(String choice) async {
    final current = conflict;
    if (current == null) return;
    if (choice == 'theirs') {
      conflict = null;
      notifyListeners();
      await loadSecrets();
      return;
    }
    // "mine": force the local edit over the server's revision.
    conflict = null;
    await _writeSecret(current.itemId, current.yourData, current.serverRevision, current.isNew);
  }

  /// Replays queued offline writes in FIFO order with capped exponential
  /// backoff; a 409 surfaces a conflict and halts that item (others
  /// continue), matching the online write path's conflict handling.
  Future<void> _drainQueue() async {
    if (_accessToken == null || _dek == null) return;
    for (final op in List.of(_queue.pending)) {
      try {
        if (op.type == QueueOpType.delete) {
          await deleteSecret(op.itemId);
        } else {
          await _writeSecret(op.itemId, op.data!, op.expectedRevision, false);
        }
        _queue.remove(op.itemId);
      } on ApiException catch (e) {
        if (e.status == 0) {
          op.attempts += 1;
          await Future<void>.delayed(_queue.backoffFor(op.attempts));
          continue;
        }
        _queue.remove(op.itemId);
      }
    }
  }

  @override
  void dispose() {
    _connectivitySub.cancel();
    super.dispose();
  }
}
