import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import 'app_back_button.dart';

/// Content Insights popup — a 1:1 port of the web `UploadContentInsightsModal`
/// (range tabs · performance-trend chart · stat cards · country/audience/
/// gender/age breakdowns). Opened from the upload-content "Insights" action.
Future<void> showUploadInsights(BuildContext context, int contentId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _UploadInsightsSheet(contentId: contentId),
  );
}

const _kRanges = [
  ['today', 'Today'],
  ['7d', '7 Days'],
  ['30d', '30 Days'],
  ['all', 'All Time'],
];

const _emerald = Color(0xFF6EE7B7);
const _cyan = Color(0xFF67E8F9);
const _cardBg = Color(0xFF101216);

num _num(dynamic v) => v is num ? v : (num.tryParse('$v') ?? 0);

double _pick(Map t, List<String> keys) {
  for (final k in keys) {
    if (t[k] != null) return _num(t[k]).toDouble();
  }
  return 0;
}

String _fmtNum(num v, {int decimals = 0}) {
  final fixed = v.toStringAsFixed(decimals);
  final parts = fixed.split('.');
  final neg = parts[0].startsWith('-');
  final digits = neg ? parts[0].substring(1) : parts[0];
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
    buf.write(digits[i]);
  }
  var out = (neg ? '-' : '') + buf.toString();
  if (decimals > 0) {
    var dec = parts.length > 1 ? parts[1] : '';
    dec = dec.replaceAll(RegExp(r'0+$'), '');
    if (dec.isNotEmpty) out = '$out.$dec';
  }
  return out;
}

String _money(num v) => 'R ${_fmtNum(v, decimals: 2)}';
String _pct(num v) => '${_fmtNum(v, decimals: 2)}%';

class _UploadInsightsSheet extends StatefulWidget {
  final int contentId;
  const _UploadInsightsSheet({required this.contentId});

  @override
  State<_UploadInsightsSheet> createState() => _UploadInsightsSheetState();
}

class _UploadInsightsSheetState extends State<_UploadInsightsSheet> {
  String _range = '7d';
  bool _loading = true;
  String _error = '';
  Map<String, dynamic>? _insights;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    final data = await Api.uploadContentInsights(widget.contentId, _range);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (data == null) {
        _error = 'Failed to load insights.';
      } else {
        _insights = data;
      }
    });
  }

  void _setRange(String r) {
    if (r == _range) return;
    setState(() => _range = r);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.85;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight, maxWidth: 420),
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: _cardBg,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(22),
              ),
              border: Border.all(color: Colors.white.withOpacity(0.10)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _header(),
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _rangeTabs(),
                        const SizedBox(height: 12),
                        _body(),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
      ),
      child: Row(
        children: [
          // Was a bare Icon that looked tappable but did nothing; now the
          // standard control, so it actually dismisses the sheet.
          const AppBackButton(
            padding: EdgeInsets.symmetric(vertical: 6, horizontal: 2),
          ),
          const SizedBox(width: 10),
          const Text(
            'Insights',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Ionicons.close,
                size: 16,
                color: Colors.white.withOpacity(0.65),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _rangeTabs() {
    return Row(
      children: [
        for (final r in _kRanges) ...[
          Expanded(
            child: GestureDetector(
              onTap: () => _setRange(r[0]),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _range == r[0]
                      ? _emerald
                      : Colors.white.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  r[1],
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: _range == r[0]
                        ? Colors.black
                        : Colors.white.withOpacity(0.55),
                  ),
                ),
              ),
            ),
          ),
          if (r != _kRanges.last) const SizedBox(width: 4),
        ],
      ],
    );
  }

  Widget _body() {
    if (_loading) {
      return _panel(
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 26),
          child: Center(
            child: Text(
              'Loading insights...',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: Colors.white54,
              ),
            ),
          ),
        ),
      );
    }
    if (_error.isNotEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.10),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.red.withOpacity(0.20)),
        ),
        child: Text(
          _error,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: Color(0xFFFFE1E1),
          ),
        ),
      );
    }
    final insights = _insights;
    if (insights == null) return const SizedBox.shrink();

    final totals = Map<String, dynamic>.from(
      (insights['totals'] as Map?) ?? const {},
    );
    final trend = (insights['trend'] as List?) ?? const [];
    final views = _pick(totals, ['views']);
    final shares = _pick(totals, ['shares']);
    final totalEarnings = _pick(totals, [
      'totalEarnings',
      'total_earnings',
      'earnings',
    ]);
    final creatorNet = _pick(totals, [
      'creatorNetEarnings',
      'creator_net_earnings',
      'earnings',
    ]);
    final platformFeePct = _pick(totals, [
      'platformFeePercentage',
      'platform_fee_percentage',
    ]);
    final subCommissionPct = _pick(totals, [
      'subscriptionCommissionPercentage',
      'subscription_commission_percentage',
    ]);
    final shareCommission = _pick(totals, [
      'shareCommission',
      'share_commission',
    ]);
    final contentType = (totals['contentType'] ?? totals['content_type'] ?? '')
        .toString()
        .toLowerCase();
    final platformFeeSubline = contentType == 'flash'
        ? 'Flash commission'
        : (subCommissionPct > 0 && subCommissionPct != platformFeePct)
        ? 'Vault ${_pct(platformFeePct)} / Sub ${_pct(subCommissionPct)}'
        : 'Vault commission';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_hasTrend(trend)) ...[
          _trendSection(trend),
          const SizedBox(height: 12),
        ],
        _statCards([
          [
            Ionicons.eye_outline,
            'Total Views',
            _fmtNum(views),
            'Views in selected range',
          ],
          [
            Ionicons.cash_outline,
            'Total Earnings',
            _money(totalEarnings),
            'Gross sales',
          ],
          [
            Ionicons.card_outline,
            'Platform Fee',
            _pct(platformFeePct),
            platformFeeSubline,
          ],
          [
            Ionicons.wallet_outline,
            'Creator Net Earnings',
            _money(creatorNet),
            'After platform fee',
          ],
          [
            Ionicons.share_social_outline,
            'Total Shares',
            _fmtNum(shares),
            'Share commission ${_money(shareCommission)}',
          ],
        ]),
        const SizedBox(height: 12),
        _listSection(
          'Top Countries',
          insights['countries'],
          'No country data yet.',
        ),
        const SizedBox(height: 12),
        _listSection(
          'Audience Type',
          insights['audienceTypes'],
          'No subscriber audience data yet.',
        ),
        const SizedBox(height: 12),
        _listSection('Gender', insights['genders'], 'No gender data yet.'),
        const SizedBox(height: 12),
        _listSection('Age', insights['ages'], 'No age data yet.'),
      ],
    );
  }

  bool _hasTrend(List trend) => trend.any((r) {
    final m = (r as Map?) ?? const {};
    return _num(m['views']) > 0 ||
        _num(m['sales']) > 0 ||
        _num(m['shares']) > 0 ||
        _num(m['earnings']) > 0;
  });

  Widget _panel(Widget child) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: child,
    );
  }

  Widget _trendSection(List trend) {
    var maxVal = 1.0;
    for (final r in trend) {
      final m = (r as Map?) ?? const {};
      final v = [
        _num(m['views']).toDouble(),
        _num(m['sales']).toDouble(),
        _num(m['shares']).toDouble(),
      ].reduce((a, b) => a > b ? a : b);
      if (v > maxVal) maxVal = v;
    }
    final label = _range == '7d'
        ? '7 Days'
        : _range == '30d'
        ? '30 Days'
        : _range == 'today'
        ? 'Today'
        : 'All Time';
    return _panel(
      Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        'Performance Trend',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'VIEWS / SALES / SHARES OVERVIEW',
                        style: TextStyle(
                          fontSize: 8,
                          letterSpacing: 1.2,
                          fontWeight: FontWeight.w500,
                          color: Colors.white38,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.04),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: Text(
                    label.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 8,
                      letterSpacing: 1.1,
                      fontWeight: FontWeight.w600,
                      color: Colors.white54,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final r in trend) ...[
                    Expanded(child: _trendBar((r as Map?) ?? const {}, maxVal)),
                    if (r != trend.last) const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _trendBar(Map row, double maxVal) {
    final v = [
      _num(row['views']).toDouble(),
      _num(row['sales']).toDouble(),
      _num(row['shares']).toDouble(),
    ].reduce((a, b) => a > b ? a : b);
    final frac = (v / maxVal).clamp(0.08, 1.0);
    final date = (row['date'] ?? '').toString();
    final shortDate = date.length >= 5 ? date.substring(5) : date;
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Expanded(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: FractionallySizedBox(
              heightFactor: frac,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 40),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Color(0xFF34D399), _cyan],
                  ),
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 5),
        Text(
          shortDate,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 8,
            fontWeight: FontWeight.w500,
            color: Colors.white38,
          ),
        ),
      ],
    );
  }

  Widget _statCards(List<List<Object>> cards) {
    return LayoutBuilder(
      builder: (context, c) {
        const gap = 8.0;
        final cardW = (c.maxWidth - gap) / 2;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final card in cards)
              SizedBox(
                width: cardW,
                child: _statCard(
                  card[0] as IconData,
                  card[1] as String,
                  card[2] as String,
                  card[3] as String,
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _statCard(IconData icon, String label, String value, String subline) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: _emerald),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 8,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withOpacity(0.42),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subline,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w500,
              color: Colors.white.withOpacity(0.38),
            ),
          ),
        ],
      ),
    );
  }

  Widget _listSection(String title, dynamic rawRows, String empty) {
    final rows = (rawRows as List?) ?? const [];
    final visible = rows
        .map((e) => (e as Map?) ?? const {})
        .where((m) {
          final label = (m['label'] ?? '').toString();
          return label.isNotEmpty &&
              label.toLowerCase() != 'unknown' &&
              _num(m['count']) > 0;
        })
        .take(5)
        .toList();
    return _panel(
      Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 10),
            if (visible.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.03),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Text(
                  empty,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withOpacity(0.45),
                  ),
                ),
              )
            else
              for (var i = 0; i < visible.length; i++) ...[
                _insightRow(i + 1, visible[i]),
                if (i != visible.length - 1) const SizedBox(height: 8),
              ],
          ],
        ),
      ),
    );
  }

  Widget _insightRow(int rank, Map row) {
    final label = (row['label'] ?? '').toString();
    final pct = _num(row['percentage']).toDouble().clamp(0, 100).toDouble();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$rank. $label',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withOpacity(0.80),
                ),
              ),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: (pct.clamp(4, 100)) / 100,
                  minHeight: 6,
                  backgroundColor: Colors.white.withOpacity(0.08),
                  valueColor: const AlwaysStoppedAnimation(_emerald),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Text(
          '${pct.round()}%',
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ],
    );
  }
}
