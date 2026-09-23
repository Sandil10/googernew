class WalletDashboardSnapshot {
  final String googerId;
  final double balance;
  final int transactionCount;
  final int adCount;
  final bool isVerified;
  final String planName;

  const WalletDashboardSnapshot({
    required this.googerId,
    required this.balance,
    required this.transactionCount,
    required this.adCount,
    required this.isVerified,
    required this.planName,
  });

  factory WalletDashboardSnapshot.fromApi(Map<String, dynamic> payload) {
    final profile = _asMap(payload['profile']);
    final verificationEnvelope = _asMap(payload['verification']);
    final verification = _asMap(
      verificationEnvelope['verification'] ??
          verificationEnvelope['data'] ??
          verificationEnvelope,
    );
    final subscriptionEnvelope = _asMap(payload['subscription']);
    final subscription = _asMap(
      subscriptionEnvelope['subscription'] ?? subscriptionEnvelope['data'],
    );
    final status = '${verification['status'] ?? ''}'.trim().toLowerCase();

    return WalletDashboardSnapshot(
      googerId:
          '${profile['user_id'] ?? profile['googer_id'] ?? profile['id'] ?? ''}'
              .trim(),
      balance: _asDouble(profile['wallet_balance']),
      transactionCount: _asList(payload['history'], const [
        'transactions',
        'data',
        'history',
      ]).length,
      adCount: _asList(payload['ads'], const ['ads', 'data', 'items']).length,
      isVerified: status == 'verified' || status == 'approved',
      planName: '${subscription['plan_name'] ?? subscription['name'] ?? ''}'
          .trim(),
    );
  }

  static Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    return const {};
  }

  static List<dynamic> _asList(dynamic value, List<String> keys) {
    if (value is List) return value;
    if (value is Map) {
      for (final key in keys) {
        final candidate = value[key];
        if (candidate is List) return candidate;
      }
    }
    return const [];
  }

  static double _asDouble(dynamic value) =>
      double.tryParse('${value ?? ''}') ?? 0;
}
