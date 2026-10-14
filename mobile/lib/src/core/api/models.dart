/// Wire-contract types mirroring backend/src/types.ts (ADR-0003/0006) and
/// web/src/lib/types.ts. Kept in lockstep manually until ADR-0005 item 4's
/// generated-from-OpenAPI pipeline lands (tracked follow-up).
library;

class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken, required this.expiresIn});

  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory TokenPair.fromJson(Map<String, dynamic> json) => TokenPair(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresIn: json['expiresIn'] as int,
      );
}

class KdfParams {
  const KdfParams({required this.algo, required this.iterations});

  final String algo;
  final int iterations;

  factory KdfParams.fromJson(Map<String, dynamic> json) =>
      KdfParams(algo: json['algo'] as String, iterations: json['iterations'] as int);

  Map<String, dynamic> toJson() => {'algo': algo, 'iterations': iterations};
}

class VaultBootstrap {
  const VaultBootstrap.notProvisioned()
      : provisioned = false,
        saltRef = null,
        salt = null,
        kdfParams = null,
        kdfParamsVersion = null;

  const VaultBootstrap.provisioned({
    required this.saltRef,
    required this.salt,
    required this.kdfParams,
    required this.kdfParamsVersion,
  }) : provisioned = true;

  final bool provisioned;
  final String? saltRef;
  final String? salt;
  final KdfParams? kdfParams;
  final int? kdfParamsVersion;

  factory VaultBootstrap.fromJson(Map<String, dynamic> json) {
    if (json['provisioned'] != true) return const VaultBootstrap.notProvisioned();
    return VaultBootstrap.provisioned(
      saltRef: json['saltRef'] as String,
      salt: json['salt'] as String,
      kdfParams: KdfParams.fromJson(json['kdfParams'] as Map<String, dynamic>),
      kdfParamsVersion: json['kdfParamsVersion'] as int,
    );
  }
}

class ItemRecord {
  const ItemRecord({
    required this.itemId,
    required this.ownerId,
    required this.ciphertext,
    required this.nonce,
    required this.algo,
    required this.kdfParams,
    required this.schemaVersion,
    required this.revision,
    required this.createdAt,
    required this.updatedAt,
    required this.deletedAt,
    required this.changeSeq,
  });

  final String itemId;
  final String ownerId;
  final String? ciphertext;
  final String? nonce;
  final String? algo;
  final Map<String, dynamic>? kdfParams;
  final int schemaVersion;
  final int revision;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;
  final int changeSeq;

  factory ItemRecord.fromJson(Map<String, dynamic> json) => ItemRecord(
        itemId: json['itemId'] as String,
        ownerId: json['ownerId'] as String,
        ciphertext: json['ciphertext'] as String?,
        nonce: json['nonce'] as String?,
        algo: json['algo'] as String?,
        kdfParams: (json['kdfParams'] as Map?)?.cast<String, dynamic>(),
        schemaVersion: json['schemaVersion'] as int,
        revision: json['revision'] as int,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
        deletedAt: json['deletedAt'] as String?,
        changeSeq: json['changeSeq'] as int,
      );
}

class ChangesPage {
  const ChangesPage({required this.items, required this.nextCursor, required this.hasMore});

  final List<ItemRecord> items;
  final int nextCursor;
  final bool hasMore;

  factory ChangesPage.fromJson(Map<String, dynamic> json) => ChangesPage(
        items: (json['items'] as List).map((e) => ItemRecord.fromJson(e as Map<String, dynamic>)).toList(),
        nextCursor: json['nextCursor'] as int,
        hasMore: json['hasMore'] as bool,
      );
}

/// Secret item plaintext, decrypted client-side only; mirrors web's `SecretData`.
class SecretData {
  const SecretData({required this.title, this.username, this.password, this.url, this.notes});

  final String title;
  final String? username;
  final String? password;
  final String? url;
  final String? notes;

  factory SecretData.fromJson(Map<String, dynamic> json) => SecretData(
        title: json['title'] as String? ?? '',
        username: json['username'] as String?,
        password: json['password'] as String?,
        url: json['url'] as String?,
        notes: json['notes'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'title': title,
        if (username != null) 'username': username,
        if (password != null) 'password': password,
        if (url != null) 'url': url,
        if (notes != null) 'notes': notes,
      };
}

/// The well-known item that carries the wrapped-DEK blobs across devices.
const vaultMetaItemId = '__vault_meta__';
const vaultMetaAlgo = 'vault-meta-v1';

class WrappedKey {
  const WrappedKey({required this.wrapped, required this.nonce});

  final String wrapped;
  final String nonce;

  factory WrappedKey.fromJson(Map<String, dynamic> json) =>
      WrappedKey(wrapped: json['wrapped'] as String, nonce: json['nonce'] as String);

  Map<String, dynamic> toJson() => {'wrapped': wrapped, 'nonce': nonce};
}

class VaultMetaPayload {
  const VaultMetaPayload({
    required this.masterSalt,
    required this.kdfParams,
    required this.wrappedDekByMaster,
    required this.recoverySalt,
    required this.wrappedDekByRecovery,
  });

  final String masterSalt;
  final KdfParams kdfParams;
  final WrappedKey wrappedDekByMaster;
  final String recoverySalt;
  final WrappedKey wrappedDekByRecovery;

  factory VaultMetaPayload.fromJson(Map<String, dynamic> json) => VaultMetaPayload(
        masterSalt: json['masterSalt'] as String,
        kdfParams: KdfParams.fromJson(json['kdfParams'] as Map<String, dynamic>),
        wrappedDekByMaster: WrappedKey.fromJson(json['wrappedDekByMaster'] as Map<String, dynamic>),
        recoverySalt: json['recoverySalt'] as String,
        wrappedDekByRecovery: WrappedKey.fromJson(json['wrappedDekByRecovery'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => {
        'masterSalt': masterSalt,
        'kdfParams': kdfParams.toJson(),
        'wrappedDekByMaster': wrappedDekByMaster.toJson(),
        'recoverySalt': recoverySalt,
        'wrappedDekByRecovery': wrappedDekByRecovery.toJson(),
      };

  VaultMetaPayload copyWith({WrappedKey? wrappedDekByMaster}) => VaultMetaPayload(
        masterSalt: masterSalt,
        kdfParams: kdfParams,
        wrappedDekByMaster: wrappedDekByMaster ?? this.wrappedDekByMaster,
        recoverySalt: recoverySalt,
        wrappedDekByRecovery: wrappedDekByRecovery,
      );
}
