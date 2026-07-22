import 'package:flutter/material.dart';
import '../services/app_session.dart';
import '../services/googer_api.dart';
import '../theme/app_colors.dart';
import '../widgets/section_card.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _hideBalance = false;
  late Future<_WalletData> _future;

  static const _gold = AppColors.accentGold;
  static const _services = [
    (Icons.receipt_long_outlined, 'History'),
    (Icons.verified_outlined, 'Verify'),
    (Icons.card_membership_outlined, 'Plans'),
    (Icons.campaign_outlined, 'Ads'),
    (Icons.toll_outlined, 'Coins'),
    (Icons.sell_outlined, 'Sell'),
    (Icons.call_received, 'Request'),
    (Icons.account_balance_wallet_outlined, 'Details'),
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future = _load();
  }

  Future<_WalletData> _load() async {
    final session = SessionScope.of(context);
    final results = await Future.wait([
      session.api.getWallet(),
      session.api.getWalletTransactions(),
    ]);
    return _WalletData(
      wallet: results[0] as Map<String, dynamic>,
      transactions: results[1] as List<WalletTransaction>,
      user: session.user ?? {},
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_WalletData>(
      future: _future,
      builder: (context, snapshot) {
        final data = snapshot.data ?? const _WalletData(wallet: {}, transactions: [], user: {});
        final balance = _walletBalance(data);
        final balanceText = _hideBalance ? '******' : 'R ${balance.toStringAsFixed(2)}';
        final googerId = data.user['user_id'] ?? data.user['googer_id'] ?? data.user['id'] ?? '';
        final transactions = data.transactions;
        return RefreshIndicator(
          color: Colors.white,
          backgroundColor: AppColors.surface,
          onRefresh: () async => setState(() => _future = _load()),
          child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (snapshot.connectionState == ConnectionState.waiting)
          const LinearProgressIndicator(color: Colors.white, backgroundColor: AppColors.surfaceRaised),
        if (snapshot.hasError)
          _StateMessage(text: snapshot.error.toString().replaceFirst('Exception: ', '')),
        const _Overline('Wallet'),
        const SizedBox(height: 10),
        _GlowWalletCard(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      balanceText,
                      style: const TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.8,
                          color: Colors.white),
                    ),
                    const SizedBox(width: 10),
                    GestureDetector(
                      onTap: () => setState(() => _hideBalance = !_hideBalance),
                      child: Icon(
                        _hideBalance
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 17,
                        color: Colors.white54,
                      ),
                    ),
                    const Spacer(),
                    const Icon(Icons.credit_card,
                        size: 26, color: Colors.white70),
                  ],
                ),
                const SizedBox(height: 4),
                Text('Googer ID - $googerId',
                    style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
                const Spacer(),
                Row(
                  children: [
                    _cardAction('Deposit', Icons.add, filled: true),
                    const SizedBox(width: 8),
                    _cardAction('Withdraw', Icons.arrow_downward),
                    const SizedBox(width: 8),
                    _cardAction('Transfer', Icons.swap_horiz),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SectionCard(
                color: AppColors.surface,
                onTap: () {},
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Transactions',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary)),
                    const SizedBox(height: 2),
                    Text('${transactions.length} recent',
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.textMuted)),
                    const SizedBox(height: 12),
                    Row(children: transactions.take(4).map((tx) => _txDot(tx)).toList()),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SectionCard(
                color: AppColors.surface,
                onTap: () {},
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Cashback',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary)),
                    SizedBox(height: 2),
                    Text('Rupier coins earned',
                        style: TextStyle(
                            fontSize: 10.5, color: AppColors.textMuted)),
                    SizedBox(height: 12),
                    Row(children: [
                      _RoundGlyph(color: _gold, glyph: 'R'),
                      _RoundGlyph(color: AppColors.accentGreen, glyph: '+'),
                      _RoundGlyph(color: AppColors.accentPurple, glyph: '%'),
                    ]),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        const Row(
          children: [
            _Overline('All services'),
            Spacer(),
            Icon(Icons.chevron_right, size: 16, color: AppColors.textMuted),
          ],
        ),
        const SizedBox(height: 10),
        SectionCard(
          color: AppColors.surface,
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 4,
            mainAxisSpacing: 16,
            childAspectRatio: 1.15,
            children: _services.map((service) {
              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(service.$1, size: 22, color: AppColors.textPrimary),
                  const SizedBox(height: 6),
                  Text(service.$2,
                      style: const TextStyle(
                          fontSize: 10, color: AppColors.textSecondary)),
                ],
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 14),
        const _Overline('Assets'),
        const SizedBox(height: 10),
        SectionCard(
          color: AppColors.surface,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Column(
            children: [
              _asset('Rupier Coin', 'RPC', balance.toStringAsFixed(2), _gold, 'R'),
              const Divider(color: AppColors.border, height: 1),
              _asset('Sri Lankan Rupee', 'LKR', balance.toStringAsFixed(2),
                  AppColors.accentGreen, 'Rs'),
            ],
          ),
        ),
        const SizedBox(height: 14),
        SectionCard(
          color: AppColors.surface,
          onTap: () {},
          child: Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Refer and Earn',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary)),
                    SizedBox(height: 4),
                    Text(
                      'Invite a friend with your Googer ID and earn Rupier coins on their first top-up.',
                      style: TextStyle(
                          fontSize: 11,
                          height: 1.5,
                          color: AppColors.textMuted),
                    ),
                    SizedBox(height: 8),
                    Text('Learn more',
                        style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: _gold)),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: _gold.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.card_giftcard, size: 24, color: _gold),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Row(
          children: [
            _Overline('Activity'),
            Spacer(),
            Text('SEE ALL',
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textMuted)),
          ],
        ),
        const SizedBox(height: 10),
        SectionCard(
          color: AppColors.surface,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child:
              Column(
                children: transactions.isEmpty
                    ? const [_StateMessage(text: 'No real wallet transactions yet.')]
                    : transactions.take(8).map((tx) => _txRow(tx, transactions.first.id == tx.id)).toList(),
              ),
        ),
        const SizedBox(height: 24),
      ],
          ),
        );
      },
    );
  }

  double _walletBalance(_WalletData data) {
    final raw = data.wallet['walletBalance'] ??
        data.wallet['wallet_balance'] ??
        data.wallet['balance'] ??
        data.user['wallet_balance'];
    if (raw is num) return raw.toDouble();
    return double.tryParse(raw?.toString() ?? '') ?? 0;
  }

  Widget _cardAction(String label, IconData icon, {bool filled = false}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: filled ? _gold : Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon,
                size: 14,
                color: filled ? const Color(0xFF181A20) : Colors.white),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                color: filled ? const Color(0xFF181A20) : Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _txDot(WalletTransaction tx) {
    final out = tx.type == 'sent' || tx.type == 'withdrawal';
    final color = out ? AppColors.accentRed : AppColors.accentGreen;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
            color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
        child: Icon(out ? Icons.arrow_upward : Icons.arrow_downward,
            size: 14, color: color),
      ),
    );
  }

  Widget _asset(
      String name, String symbol, String amount, Color color, String glyph) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
            alignment: Alignment.center,
            child: Text(glyph,
                style: TextStyle(
                    fontSize: glyph.length > 1 ? 12 : 16,
                    fontWeight: FontWeight.w800,
                    color: color)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(symbol,
                    style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textPrimary)),
                Text(name,
                    style: const TextStyle(
                        fontSize: 10.5, color: AppColors.textMuted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(_hideBalance ? '****' : amount,
                  style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary)),
              Text(_hideBalance ? '' : 'approx \$8.17',
                  style: const TextStyle(
                      fontSize: 10.5, color: AppColors.textMuted)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _txRow(WalletTransaction tx, bool first) {
    final out = tx.type == 'sent' || tx.type == 'withdrawal';
    final color = out ? AppColors.accentRedLight : AppColors.accentGreen;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: first
          ? null
          : const BoxDecoration(
              border: Border(top: BorderSide(color: AppColors.border))),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
                color: color.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(11)),
            child: Icon(
              tx.type == 'topup'
                  ? Icons.add
                  : out
                      ? Icons.arrow_upward
                      : Icons.arrow_downward,
              size: 16,
              color: color,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tx.counterparty,
                    style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary)),
                const SizedBox(height: 3),
                Text('${tx.type} - ${tx.date}',
                    style: const TextStyle(
                        fontSize: 10, color: AppColors.textMuted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${out ? '-' : '+'} R ${tx.amount.toStringAsFixed(0)}',
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w800, color: color),
              ),
              const SizedBox(height: 4),
              _StatusPill(tx.status,
                  tx.status == 'completed' ? AppColors.accentGreen : _gold),
            ],
          ),
        ],
      ),
    );
  }
}

class _WalletData {
  final Map<String, dynamic> wallet;
  final List<WalletTransaction> transactions;
  final Map<String, dynamic> user;

  const _WalletData({required this.wallet, required this.transactions, required this.user});
}

class _StateMessage extends StatelessWidget {
  const _StateMessage({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
    );
  }
}

class _GlowWalletCard extends StatelessWidget {
  final Widget child;

  const _GlowWalletCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 172,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: CustomPaint(painter: _GlowPainter(), child: child),
      ),
    );
  }
}

class _GlowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(rect,
        Paint()..shader = AppColors.walletCardGradient.createShader(rect));
    canvas.drawCircle(
      Offset(size.width * 0.86, -size.height * 0.18),
      size.height * 0.58,
      Paint()
        ..color = AppColors.accentGold.withValues(alpha: 0.16)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 40),
    );
    canvas.drawCircle(
      Offset(size.width * 0.08, size.height * 1.05),
      size.height * 0.40,
      Paint()
        ..color = AppColors.accentGold.withValues(alpha: 0.10)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 36),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RoundGlyph extends StatelessWidget {
  final Color color;
  final String glyph;

  const _RoundGlyph({required this.color, required this.glyph});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
            color: color.withValues(alpha: 0.16), shape: BoxShape.circle),
        alignment: Alignment.center,
        child: Text(glyph,
            style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w800, color: color)),
      ),
    );
  }
}

class _Overline extends StatelessWidget {
  final String text;

  const _Overline(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: AppColors.textMuted),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String text;
  final Color color;

  const _StatusPill(this.text, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999)),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
            fontSize: 8.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
            color: color),
      ),
    );
  }
}
