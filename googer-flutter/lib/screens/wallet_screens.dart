import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../widgets/kit.dart';

Widget _note(IconData icon, Color color, String text) {
  return Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withValues(alpha: 0.2)),
    ),
    child: Row(children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 10),
      Expanded(child: Text(text, style: const TextStyle(fontSize: 11, height: 1.5, color: GoogerColors.muted))),
    ]),
  );
}

Widget _labeledField(String label, String hint, {TextInputType? type, Widget? suffix}) {
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Overline(label),
    const SizedBox(height: 6),
    TextField(
      keyboardType: type,
      decoration: InputDecoration(hintText: hint, suffixIcon: suffix),
      style: const TextStyle(fontSize: 14, color: GoogerColors.text),
    ),
    const SizedBox(height: 14),
  ]);
}

/* ───────────── My Wallet ───────────── */

class MyWalletScreen extends StatefulWidget {
  const MyWalletScreen();

  @override
  State<MyWalletScreen> createState() => _MyWalletScreenState();
}

class _MyWalletScreenState extends State<MyWalletScreen> {
  List<Tx> history = [];
  List<Map<String, dynamic>> requests = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([Api.walletHistory(), Api.pendingRequests()]);
    if (!mounted) return;
    setState(() {
      history = results[0] as List<Tx>;
      requests = results[1] as List<Map<String, dynamic>>;
    });
  }

  Future<void> _respond(Map<String, dynamic> r, String action) async {
    final err = await Api.respondToRequest(int.tryParse("${r["id"]}") ?? 0, action);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(err ?? (action == "accept" ? "Request accepted — payment sent" : "Request rejected")),
      behavior: SnackBarBehavior.floating,
    ));
    if (err == null) _load();
  }

  @override
  Widget build(BuildContext context) {
    const breakdown = [
      (label: "Sales Earnings", value: 1620.25, icon: Icons.shopping_cart_outlined, color: GoogerColors.green),
      (label: "Ad Coin Rewards", value: 380.5, icon: Icons.campaign_outlined, color: GoogerColors.sky),
      (label: "Referral Bonus", value: 250.0, icon: Icons.people_outline, color: GoogerColors.amber),
      (label: "Reseller Commission", value: 200.0, icon: Icons.link, color: GoogerColors.rose),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text("My Wallet")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GlowCard(
          height: 168,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Overline("Available Balance", color: GoogerColors.dim),
            const SizedBox(height: 10),
            Rupee(Api.balance, size: 36),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                (Icons.add, "Top Up", "/wallet/topup"),
                (Icons.send_outlined, "Send", "/wallet/pay"),
                (Icons.payments_outlined, "Withdraw", "/wallet/withdrawal"),
                (Icons.swap_horiz, "Sell", "/wallet/sell"),
              ].map((a) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 9),
                  child: GestureDetector(
                    onTap: () => Navigator.pushNamed(context, a.$3),
                    child: Column(children: [
                      IconChip(a.$1, size: 42, color: GoogerColors.text),
                      const SizedBox(height: 5),
                      Text(a.$2, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w500, color: GoogerColors.muted)),
                    ]),
                  ),
                );
              }).toList(),
            ),
          ]),
        ),
        const SizedBox(height: 20),
        const SectionTitle(icon: Icons.pie_chart_outline, title: "Earnings Breakdown"),
        GoogerCard(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Column(
            children: breakdown.map((b) {
              return Container(
                padding: const EdgeInsets.symmetric(vertical: 13),
                decoration: BoxDecoration(
                  border: b != breakdown.first
                      ? const Border(top: BorderSide(color: GoogerColors.borderSoft))
                      : null,
                ),
                child: Row(children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(color: b.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                    child: Icon(b.icon, size: 16, color: b.color),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text(b.label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text))),
                  Rupee(b.value, size: 13),
                ]),
              );
            }).toList(),
          ),
        ),
        // Pending money requests → /wallet/pending-requests, accept/reject like the web
        if (requests.isNotEmpty) ...[
          const SizedBox(height: 16),
          const SectionTitle(icon: Icons.call_received, title: "Money Requests"),
          ...requests.map((r) {
            final from = (r["requester_username"] ?? r["sender_username"] ?? r["username"] ?? "user").toString();
            final amt = double.tryParse("${r["amount"] ?? 0}") ?? 0;
            final noteTxt = (r["note"] ?? "").toString();
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GoogerCard(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(
                      child: Text("@$from requests R ${amt.toStringAsFixed(2)}",
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                    ),
                    const StatusPill("pending", GoogerColors.amber),
                  ]),
                  if (noteTxt.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(noteTxt, style: const TextStyle(fontSize: 11, color: GoogerColors.muted)),
                  ],
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(36),
                            backgroundColor: GoogerColors.greenDeep,
                            foregroundColor: Colors.white),
                        onPressed: () => _respond(r, "accept"),
                        child: const Text("Accept & Pay", style: TextStyle(fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(36), foregroundColor: GoogerColors.red),
                        onPressed: () => _respond(r, "reject"),
                        child: const Text("Reject", style: TextStyle(fontSize: 12)),
                      ),
                    ),
                  ]),
                ]),
              ),
            );
          }),
        ],
        const SizedBox(height: 16),
        SectionTitle(icon: Icons.history, title: "Activity", action: "See All", onAction: () => Navigator.pushNamed(context, "/wallet/transactions")),
        GoogerCard(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Column(
            children: history.take(4).map((tx) {
              final out = tx.type == "sent" || tx.type == "withdrawal";
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: (out ? GoogerColors.red : GoogerColors.green).withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(out ? Icons.arrow_upward : Icons.arrow_downward, size: 15, color: out ? const Color(0xFFF87171) : GoogerColors.green),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(tx.counterparty, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                      Text(tx.date, style: const TextStyle(fontSize: 10, color: GoogerColors.dim)),
                    ]),
                  ),
                  Text("${out ? "-" : "+"} R ${tx.amount.toStringAsFixed(0)}",
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: out ? const Color(0xFFF87171) : GoogerColors.green)),
                ]),
              );
            }).toList(),
          ),
        ),
      ]),
    );
  }
}

/* ───────────── Top Up ───────────── */

class TopupScreen extends StatefulWidget {
  const TopupScreen();

  @override
  State<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends State<TopupScreen> {
  int selectedPack = 1;
  String method = "bank";

  @override
  Widget build(BuildContext context) {
    const methods = [
      (key: "bank", label: "Bank Transfer", desc: "Upload a deposit slip for review", icon: Icons.account_balance_outlined),
      (key: "card", label: "Card Payment", desc: "Visa / Mastercard — instant", icon: Icons.credit_card_outlined),
      (key: "coins", label: "Buy from Sellers", desc: "P2P Rupier coin marketplace", icon: Icons.people_outline),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text("Top Up")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        const SectionTitle(icon: Icons.toll_outlined, title: "Coin Packs"),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.35),
          itemCount: coinPacks.length,
          itemBuilder: (_, i) {
            final p = coinPacks[i];
            final active = selectedPack == i;
            return GestureDetector(
              onTap: () => setState(() => selectedPack = i),
              child: Container(
                decoration: BoxDecoration(
                  color: active ? Colors.white : GoogerColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: active ? Colors.white : GoogerColors.border),
                ),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text("${p.coins}", style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: active ? const Color(0xFF111111) : GoogerColors.text)),
                  Overline("Rupier Coins", color: active ? Colors.black54 : GoogerColors.dim),
                  const SizedBox(height: 6),
                  Text("R ${p.price.toStringAsFixed(0)}", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: active ? const Color(0xFF111111) : GoogerColors.muted)),
                  if (p.bonus > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: StatusPill("+${p.bonus} bonus", GoogerColors.greenDeep),
                    ),
                ]),
              ),
            );
          },
        ),
        const SizedBox(height: 16),
        _labeledField("Or enter custom amount", "Amount in R", type: TextInputType.number),
        const SectionTitle(icon: Icons.account_balance_wallet_outlined, title: "Payment Method"),
        ...methods.map((m) {
          final active = method == m.key;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: GestureDetector(
              onTap: () => setState(() => method = m.key),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: GoogerColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: active ? Colors.white54 : GoogerColors.border),
                ),
                child: Row(children: [
                  IconChip(m.icon, size: 40, color: GoogerColors.text),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(m.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                      Text(m.desc, style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                    ]),
                  ),
                  Icon(active ? Icons.radio_button_checked : Icons.radio_button_off, size: 19, color: active ? Colors.white : GoogerColors.dim),
                ]),
              ),
            ),
          );
        }),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () => Navigator.pushNamed(context, method == "coins" ? "/wallet/coins" : "/wallet/bank-transfer"),
          child: const Text("Continue"),
        ),
      ]),
    );
  }
}

/* ───────────── Bank Transfer ───────────── */

class BankTransferScreen extends StatelessWidget {
  const BankTransferScreen();

  @override
  Widget build(BuildContext context) {
    const bank = [("Bank", "Commercial Bank of Ceylon"), ("Account Name", "Googer (Pvt) Ltd"), ("Account No.", "8001 2345 6789"), ("Branch", "Colombo 03")];
    return Scaffold(
      appBar: AppBar(title: const Text("Bank Transfer")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: const [
              Icon(Icons.account_balance_outlined, size: 18, color: GoogerColors.text),
              SizedBox(width: 8),
              Text("Deposit To", style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              Spacer(),
              Icon(Icons.copy, size: 14, color: GoogerColors.dim),
            ]),
            const SizedBox(height: 8),
            ...bank.map((row) => Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: const BoxDecoration(border: Border(top: BorderSide(color: GoogerColors.borderSoft))),
                  child: Row(children: [
                    Text(row.$1, style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
                    const Spacer(),
                    Text(row.$2, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                  ]),
                )),
          ]),
        ),
        const SizedBox(height: 16),
        _labeledField("Deposited Amount (R)", "0.00", type: TextInputType.number),
        _labeledField("Bank Reference / Slip No.", "e.g. DEP-20260710-0042"),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 28),
          decoration: BoxDecoration(
            color: GoogerColors.soft,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GoogerColors.line),
          ),
          child: Column(children: const [
            Icon(Icons.cloud_upload_outlined, size: 26, color: GoogerColors.faint),
            SizedBox(height: 6),
            Text("Upload deposit slip", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.muted)),
            Text("JPG, PNG or PDF · max 5MB", style: TextStyle(fontSize: 10, color: GoogerColors.dim)),
          ]),
        ),
        const SizedBox(height: 14),
        _note(Icons.info_outline, GoogerColors.sky, "Bank transfers are verified manually within 24 hours. Coins are credited once your slip is approved."),
        const SizedBox(height: 16),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text("Submit for Review")),
      ]),
    );
  }
}

/* ───────────── Withdrawal ───────────── */

class WithdrawalScreen extends StatefulWidget {
  const WithdrawalScreen();

  @override
  State<WithdrawalScreen> createState() => _WithdrawalScreenState();
}

class _WithdrawalScreenState extends State<WithdrawalScreen> {
  final amount = TextEditingController();
  int account = 0;

  @override
  Widget build(BuildContext context) {
    final num = double.tryParse(amount.text) ?? 0;
    final fee = num * 0.02;
    const accounts = [("Commercial Bank •••• 4821", "S. Dilmith"), ("Sampath Bank •••• 9034", "S. Dilmith")];
    return Scaffold(
      appBar: AppBar(title: const Text("Withdrawal")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          child: Column(children: [
            const Overline("Available to withdraw", color: GoogerColors.dim),
            const SizedBox(height: 6),
            Rupee(Api.balance, size: 26),
          ]),
        ),
        const SizedBox(height: 16),
        const Overline("Amount (R)"),
        const SizedBox(height: 6),
        TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: "0.00"),
          style: const TextStyle(fontSize: 14, color: GoogerColors.text),
        ),
        const SizedBox(height: 8),
        Row(
          children: [25, 50, 100].map((pct) {
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => setState(() => amount.text = (Api.balance * pct / 100).toStringAsFixed(2)),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: GoogerColors.soft6,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GoogerColors.line),
                  ),
                  child: Text(pct == 100 ? "MAX" : "$pct%", style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: GoogerColors.muted)),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        const Overline("Withdraw To"),
        const SizedBox(height: 8),
        ...List.generate(accounts.length, (i) {
          final active = account == i;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: GestureDetector(
              onTap: () => setState(() => account = i),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: GoogerColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: active ? Colors.white54 : GoogerColors.border),
                ),
                child: Row(children: [
                  const IconChip(Icons.account_balance_outlined, size: 38, color: GoogerColors.text),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(accounts[i].$1, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                      Text(accounts[i].$2, style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                    ]),
                  ),
                  Icon(active ? Icons.radio_button_checked : Icons.radio_button_off, size: 19, color: active ? Colors.white : GoogerColors.dim),
                ]),
              ),
            ),
          );
        }),
        OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.add, size: 16),
          label: const Text("Add bank account"),
        ),
        const SizedBox(height: 16),
        GoogerCard(
          child: Column(children: [
            Row(children: [
              const Text("Withdrawal amount", style: TextStyle(fontSize: 12, color: GoogerColors.muted)),
              const Spacer(),
              Text("R ${num.toStringAsFixed(2)}", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Text("Processing fee (2%)", style: TextStyle(fontSize: 12, color: GoogerColors.muted)),
              const Spacer(),
              Text("- R ${fee.toStringAsFixed(2)}", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Color(0xFFF87171))),
            ]),
            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
            Row(children: [
              const Text("You receive", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              const Spacer(),
              Text("R ${(num - fee).clamp(0, double.infinity).toStringAsFixed(2)}",
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: GoogerColors.green)),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: num > 0 && num <= Api.balance ? () => Navigator.pushNamed(context, "/wallet/transactions") : null,
          child: const Text("Request Withdrawal"),
        ),
      ]),
    );
  }
}

/* ───────────── Transactions ───────────── */

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen();

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  String filter = "All";
  List<Tx> history = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final h = await Api.walletHistory();
    if (mounted) setState(() => history = h);
  }

  Future<void> _cancel(Tx tx) async {
    final err = await Api.cancelTransaction(tx.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(err ?? "Transaction cancelled — funds returned"),
      behavior: SnackBarBehavior.floating,
    ));
    if (err == null) _load();
  }

  @override
  Widget build(BuildContext context) {
    final map = {"Sent": "sent", "Received": "received", "Top Up": "topup", "Withdrawal": "withdrawal"};
    final visible = filter == "All" ? history : history.where((t) => t.type == map[filter]).toList();
    Color statusColor(String s) => s == "completed" ? GoogerColors.green : s == "pending" ? GoogerColors.amber : const Color(0xFFF87171);
    return Scaffold(
      appBar: AppBar(
        title: const Text("Transactions"),
        actions: const [
          Padding(padding: EdgeInsets.only(right: 14), child: Icon(Icons.download_outlined, size: 19)),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 4),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: ChoiceChipRow(
              options: const ["All", "Sent", "Received", "Top Up", "Withdrawal"],
              selected: filter,
              onSelect: (f) => setState(() => filter = f),
            ),
          ),
        ),
        Expanded(
          child: visible.isEmpty
              ? const EmptyState(icon: Icons.receipt_long_outlined, title: "No transactions", subtitle: "Nothing matches this filter yet.")
              : ListView.separated(
                  padding: const EdgeInsets.all(18),
                  itemCount: visible.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final tx = visible[i];
                    final out = tx.type == "sent" || tx.type == "withdrawal";
                    return GoogerCard(
                      padding: const EdgeInsets.all(14),
                      child: Row(children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: (out ? GoogerColors.red : GoogerColors.green).withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Icon(
                              tx.type == "topup"
                                  ? Icons.add
                                  : tx.type == "withdrawal"
                                      ? Icons.account_balance_outlined
                                      : out
                                          ? Icons.arrow_upward
                                          : Icons.arrow_downward,
                              size: 16,
                              color: out ? const Color(0xFFF87171) : GoogerColors.green),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(tx.counterparty, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                            const SizedBox(height: 3),
                            Overline("${tx.type} · ${tx.date}", color: GoogerColors.dim),
                          ]),
                        ),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text("${out ? "-" : "+"} R ${tx.amount.toStringAsFixed(0)}",
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: out ? const Color(0xFFF87171) : GoogerColors.green)),
                          const SizedBox(height: 4),
                          StatusPill(tx.status, statusColor(tx.status)),
                          // pending outgoing transfers can be cancelled — POST /wallet/cancel
                          if (tx.status == "pending" && out)
                            GestureDetector(
                              onTap: () => _cancel(tx),
                              child: const Padding(
                                padding: EdgeInsets.only(top: 5),
                                child: Text("CANCEL",
                                    style: TextStyle(
                                        fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: GoogerColors.red)),
                              ),
                            ),
                        ]),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

/* ───────────── Subscription ───────────── */

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen();

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  String selected = "Gold";
  List<Plan> plans = subscriptionPlans.toList();
  Map<String, int> planIds = {}; // plan name → backend id
  String currentPlan = "Free";
  bool subscribing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([Api.publicPlans(), Api.mySubscription()]);
    if (!mounted) return;
    final raw = results[0] as List<Map<String, dynamic>>;
    final sub = results[1] as Map<String, dynamic>?;
    setState(() {
      if (raw.isNotEmpty) {
        plans = raw.map((m) {
          final name = (m["name"] ?? m["plan_name"] ?? m["slug"] ?? "Plan").toString();
          planIds[name] = int.tryParse("${m["id"]}") ?? 0;
          final rawFeatures = m["features"] ?? m["extra"]?["features"];
          final features = rawFeatures is List
              ? rawFeatures.map((e) => e.toString()).toList()
              : <String>["${m["googs_limit"] ?? "Unlimited"} Googs / month"];
          return Plan(
            name,
            (double.tryParse("${m["price"] ?? 0}") ?? 0).round(),
            features,
            popular: m["popular"] == true || name.toLowerCase() == "gold",
          );
        }).toList();
      }
      if (sub != null) {
        currentPlan = (sub["plan_name"] ?? sub["plan"]?["name"] ?? sub["plan_slug"] ?? "Free").toString();
      }
    });
  }

  Future<void> _subscribe() async {
    final id = planIds[selected];
    if (id == null || id == 0) {
      // Plan id not available from the server - continue with wallet payment.
      Navigator.pushNamed(context, "/wallet/pay");
      return;
    }
    setState(() => subscribing = true);
    final err = await Api.subscribePlan(id, switchPlan: currentPlan != "Free");
    if (!mounted) return;
    setState(() => subscribing = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(err ?? "Subscribed to $selected 🎉"),
      behavior: SnackBarBehavior.floating,
    ));
    if (err == null) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Subscription")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        _note(Icons.workspace_premium_outlined, GoogerColors.amber,
            "Current plan: $currentPlan${currentPlan == "Free" ? " — renews never." : " — renews monthly from your wallet."}"),
        const SizedBox(height: 14),
        ...plans.map((plan) {
          final active = selected == plan.name;
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Stack(clipBehavior: Clip.none, children: [
              GestureDetector(
                onTap: () => setState(() => selected = plan.name),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: GoogerColors.card,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: active ? Colors.white54 : GoogerColors.border),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text(plan.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      const Spacer(),
                      Text(plan.price == 0 ? "Free" : "R ${plan.price}",
                          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      if (plan.price > 0) const Text("/mo", style: TextStyle(fontSize: 11, color: GoogerColors.dim)),
                    ]),
                    const SizedBox(height: 12),
                    ...plan.features.map((f) => Padding(
                          padding: const EdgeInsets.only(bottom: 7),
                          child: Row(children: [
                            Icon(Icons.check_circle, size: 14, color: active ? GoogerColors.green : GoogerColors.dim),
                            const SizedBox(width: 8),
                            Text(f, style: const TextStyle(fontSize: 12, color: GoogerColors.muted)),
                          ]),
                        )),
                  ]),
                ),
              ),
              if (plan.popular)
                Positioned(
                  top: -9,
                  right: 16,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                    child: const Text("MOST POPULAR",
                        style: TextStyle(fontSize: 8, fontWeight: FontWeight.w600, letterSpacing: 0.8, color: Color(0xFF111111))),
                  ),
                ),
            ]),
          );
        }),
        FilledButton(
          onPressed: subscribing || selected == currentPlan ? null : _subscribe,
          child: subscribing
              ? const GoogerSpinner(size: 18, color: Color(0xFF111111))
              : Text(selected == currentPlan ? "Current Plan" : "Subscribe to $selected"),
        ),
        const SizedBox(height: 12),
        const Text("Plans renew monthly from your wallet balance. Cancel anytime from Settings → Subscription.",
            textAlign: TextAlign.center, style: TextStyle(fontSize: 10, height: 1.5, color: GoogerColors.dim)),
      ]),
    );
  }
}

/* ───────────── Verification ───────────── */

class VerificationScreen extends StatefulWidget {
  const VerificationScreen();

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  String docType = "NIC";

  @override
  Widget build(BuildContext context) {
    Widget upload(String label) => Container(
          padding: const EdgeInsets.symmetric(vertical: 22),
          decoration: BoxDecoration(
            color: GoogerColors.soft,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GoogerColors.line),
          ),
          child: Column(children: [
            const Icon(Icons.badge_outlined, size: 24, color: GoogerColors.faint),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: GoogerColors.muted)),
          ]),
        );
    return Scaffold(
      appBar: AppBar(title: const Text("Get Verified")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: GoogerColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GoogerColors.blueDeep.withValues(alpha: 0.3)),
          ),
          child: Column(children: const [
            VerifiedBadge(size: 58),
            SizedBox(height: 12),
            Text("Googer Verification", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: GoogerColors.text)),
            SizedBox(height: 6),
            Text("A blue verification badge builds trust with your audience and unlocks seller protections.",
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, height: 1.5, color: GoogerColors.muted)),
          ]),
        ),
        const SizedBox(height: 16),
        _labeledField("Full Legal Name", "As shown on your ID"),
        const Overline("Document Type"),
        const SizedBox(height: 8),
        ChoiceChipRow(options: const ["NIC", "Passport", "Driving License"], selected: docType, onSelect: (d) => setState(() => docType = d)),
        const SizedBox(height: 14),
        _labeledField("$docType Number", "Document number"),
        Row(children: [
          Expanded(child: upload("Front of ID")),
          const SizedBox(width: 10),
          Expanded(child: upload("Back of ID")),
        ]),
        const SizedBox(height: 10),
        upload("Selfie holding your ID"),
        const SizedBox(height: 14),
        _note(Icons.verified_user_outlined, GoogerColors.blue, "Review takes 1–3 business days. The badge appears on your profile and Googs once approved."),
        const SizedBox(height: 16),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text("Apply Now")),
      ]),
    );
  }
}

/* ───────────── Googer Pay — real transfer via /wallet/transfer ───────────── */

class WalletPayScreen extends StatefulWidget {
  const WalletPayScreen();

  @override
  State<WalletPayScreen> createState() => _WalletPayScreenState();
}

class _WalletPayScreenState extends State<WalletPayScreen> {
  final to = TextEditingController();
  final amount = TextEditingController();
  final note = TextEditingController();
  bool sent = false;
  bool sending = false;
  String mode = "Send"; // Send → /wallet/transfer, Request → /wallet/request
  List<Map<String, dynamic>> results = [];
  Map<String, dynamic>? recipient; // selected user {id, username, full_name, profile_picture}

  Future<void> _search(String q) async {
    setState(() => recipient = null);
    if (q.trim().length < 2) {
      setState(() => results = []);
      return;
    }
    final r = await Api.searchWalletUsers(q.trim().replaceFirst("@", ""));
    if (mounted) setState(() => results = r.take(5).toList());
  }

  Future<void> _send() async {
    final amt = double.tryParse(amount.text) ?? 0;
    if (recipient == null || amt <= 0) return;
    setState(() => sending = true);
    final receiverId = int.tryParse("${recipient!["id"]}") ?? 0;
    final err = mode == "Request"
        ? await Api.requestMoney(receiverId, amt, note.text.trim())
        : await Api.walletTransfer(receiverId, amt, note.text.trim());
    if (!mounted) return;
    if (err == null) {
      setState(() {
        sending = false;
        sent = true;
      });
    } else {
      setState(() => sending = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(err), behavior: SnackBarBehavior.floating));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (sent) {
      return Scaffold(
        appBar: AppBar(title: const Text("Googer Pay")),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(30),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 84,
                height: 84,
                decoration: const BoxDecoration(color: GoogerColors.greenDeep, shape: BoxShape.circle),
                child: const Icon(Icons.check, size: 40, color: Colors.white),
              ),
              const SizedBox(height: 18),
              Text(mode == "Request" ? "Request Sent" : "Payment Sent",
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              const SizedBox(height: 8),
              Rupee(double.tryParse(amount.text) ?? 0, size: 30),
              const SizedBox(height: 4),
              Text("${mode == "Request" ? "from" : "to"} @${recipient?["username"] ?? "googer"} · just now",
                  style: const TextStyle(fontSize: 12, color: GoogerColors.dim)),
              const SizedBox(height: 26),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                    onPressed: () => Navigator.pushNamed(context, "/wallet/transactions"),
                    child: const Text("View Receipt")),
              ),
              const SizedBox(height: 10),
              SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(context), child: const Text("Done"))),
            ]),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text("Googer Pay"),
        actions: const [Padding(padding: EdgeInsets.only(right: 14), child: Icon(Icons.qr_code_scanner, size: 19))],
      ),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            const Overline("Balance", color: GoogerColors.dim),
            const Spacer(),
            Rupee(Api.balance, size: 16),
          ]),
        ),
        const SizedBox(height: 14),
        // Send ⇄ Request toggle — mirrors the web wallet's two flows
        Row(
          children: ["Send", "Request"].map((m) {
            final active = mode == m;
            return Expanded(
              child: GestureDetector(
                onTap: () => setState(() => mode = m),
                child: Container(
                  margin: EdgeInsets.only(right: m == "Send" ? 8 : 0),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: active ? Colors.white : GoogerColors.soft6,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: active ? Colors.white : GoogerColors.line),
                  ),
                  alignment: Alignment.center,
                  child: Text(m == "Send" ? "Send Money" : "Request Money",
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: active ? const Color(0xFF111111) : GoogerColors.muted)),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        Overline(mode == "Request" ? "From (search @username or Googer ID)" : "To (search @username or Googer ID)"),
        const SizedBox(height: 6),
        TextField(
          controller: to,
          onChanged: _search,
          decoration: InputDecoration(
            hintText: "Search users…",
            prefixIcon: const Icon(Icons.search, size: 18, color: GoogerColors.dim),
            suffixIcon: recipient != null ? const Icon(Icons.check_circle, size: 18, color: GoogerColors.green) : null,
          ),
          style: const TextStyle(fontSize: 14, color: GoogerColors.text),
        ),
        // live search results from /wallet/search-users
        ...results.map((u) => InkWell(
              onTap: () => setState(() {
                recipient = u;
                to.text = "@${u["username"]}";
                results = [];
              }),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                child: Row(children: [
                  GoogerAvatar(
                      url: (u["profile_picture"] ?? "").toString().isEmpty ? null : Api.resolveMedia(u["profile_picture"].toString()),
                      name: (u["full_name"] ?? u["username"] ?? "?").toString(),
                      size: 36),
                  const SizedBox(width: 10),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text((u["full_name"] ?? u["username"]).toString(),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                    Text("@${u["username"]}", style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
                  ]),
                ]),
              ),
            )),
        const SizedBox(height: 16),
        const Overline("Recent"),
        const SizedBox(height: 10),
        SizedBox(
          height: 74,
          child: FutureBuilder<List<Conversation>>(
            future: Api.chats(),
            builder: (context, snap) {
              final list = snap.data ?? const <Conversation>[];
              return ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(width: 14),
                itemBuilder: (_, i) {
                  final c = list[i];
                  return GestureDetector(
                    onTap: () {
                      to.text = "@${c.username}";
                      _search(c.username);
                    },
                    child: Column(children: [
                      GoogerAvatar(url: c.img, name: c.name, size: 48),
                      const SizedBox(height: 4),
                      Text("@${c.username}", style: const TextStyle(fontSize: 9, color: GoogerColors.dim)),
                    ]),
                  );
                },
              );
            },
          ),
        ),
        const SizedBox(height: 14),
        const Overline("Amount (R)"),
        const SizedBox(height: 6),
        TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: "0.00"),
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: GoogerColors.text),
        ),
        const SizedBox(height: 14),
        const Overline("Note (optional)"),
        const SizedBox(height: 6),
        TextField(controller: note, decoration: const InputDecoration(hintText: "What's this for?"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: recipient != null && (double.tryParse(amount.text) ?? 0) > 0 && !sending ? _send : null,
          child: sending
              ? const GoogerSpinner(size: 18, color: Color(0xFF111111))
              : Text(mode == "Request" ? "Send Request" : "Send Payment"),
        ),
        const SizedBox(height: 12),
        const Text("Transfers between Googer wallets are instant and free. Double-check the recipient — payments can't be reversed.",
            textAlign: TextAlign.center, style: TextStyle(fontSize: 10, height: 1.5, color: GoogerColors.dim)),
      ]),
    );
  }
}
/* ───────────── Ad Center ───────────── */

class AdCenterScreen extends StatefulWidget {
  const AdCenterScreen();

  @override
  State<AdCenterScreen> createState() => _AdCenterScreenState();
}

class _AdCenterScreenState extends State<AdCenterScreen> {
  String tab = "All";

  @override
  Widget build(BuildContext context) {
    final visible = myAds.where((a) => tab == "All" || a.status == tab).toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text("Ad Center"),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 14)),
              onPressed: () => Navigator.pushNamed(context, "/ads"),
              child: const Text("New Ad", style: TextStyle(fontSize: 11)),
            ),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Row(
          children: [("Total Views", "15.1k", Icons.remove_red_eye_outlined), ("Coins Earned", "1,070", Icons.toll_outlined), ("Active Ads", "2", Icons.campaign_outlined)]
              .map((s) => Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GoogerCard(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Column(children: [
                          Icon(s.$3, size: 15, color: GoogerColors.muted),
                          const SizedBox(height: 4),
                          Text(s.$2, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                          const SizedBox(height: 2),
                          Text(s.$1, style: const TextStyle(fontSize: 8.5, color: GoogerColors.dim)),
                        ]),
                      ),
                    ),
                  ))
              .toList(),
        ),
        const SizedBox(height: 14),
        ChoiceChipRow(options: const ["All", "Active", "Ended"], selected: tab, onSelect: (t) => setState(() => tab = t)),
        const SizedBox(height: 14),
        ...visible.map((ad) {
          final active = ad.status == "Active";
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: GoogerCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Overline(ad.type, color: GoogerColors.dim),
                  const Spacer(),
                  StatusPill(ad.status, active ? GoogerColors.green : GoogerColors.dim),
                ]),
                const SizedBox(height: 8),
                Text(ad.title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                const SizedBox(height: 10),
                Row(children: [
                  const Icon(Icons.remove_red_eye_outlined, size: 13, color: GoogerColors.muted),
                  const SizedBox(width: 5),
                  Text("${ad.views} views", style: const TextStyle(fontSize: 10.5, color: GoogerColors.muted)),
                  const SizedBox(width: 16),
                  const Icon(Icons.toll_outlined, size: 13, color: GoogerColors.amber),
                  const SizedBox(width: 5),
                  Text("${ad.coins} coins", style: const TextStyle(fontSize: 10.5, color: GoogerColors.muted)),
                  const SizedBox(width: 16),
                  const Icon(Icons.schedule, size: 13, color: GoogerColors.muted),
                  const SizedBox(width: 5),
                  Text(ad.expires, style: const TextStyle(fontSize: 10.5, color: GoogerColors.muted)),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(36)), onPressed: () {}, child: const Text("Analytics", style: TextStyle(fontSize: 11)))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(36)),
                        onPressed: () => Navigator.pushNamed(context, "/ads"),
                        child: Text(active ? "Boost" : "Promote Again", style: const TextStyle(fontSize: 11))),
                  ),
                ]),
              ]),
            ),
          );
        }),
        if (visible.isEmpty)
          const EmptyState(icon: Icons.campaign_outlined, title: "No ads here", subtitle: "Create a campaign to start promoting."),
      ]),
    );
  }
}

/* ───────────── Coins Management ───────────── */

class CoinsManagementScreen extends StatelessWidget {
  const CoinsManagementScreen();

  @override
  Widget build(BuildContext context) {
    const listings = [("@nimasha", 2000, 0.98, true), ("@coin_hub", 10000, 0.97, true), ("@kasun_lk", 750, 1.0, false)];
    return Scaffold(
      appBar: AppBar(title: const Text("Coins Management")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: GoogerColors.amber.withValues(alpha: 0.12),
                shape: BoxShape.circle,
                border: Border.all(color: GoogerColors.amber.withValues(alpha: 0.35)),
              ),
              alignment: Alignment.center,
              child: const Text("R", style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600, color: GoogerColors.amber)),
            ),
            const SizedBox(height: 10),
            const Text("2,450", style: TextStyle(fontSize: 32, fontWeight: FontWeight.w600, letterSpacing: -0.8, color: GoogerColors.text)),
            const Overline("Rupier Coins", color: GoogerColors.dim),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size(120, 38)),
                  onPressed: () => Navigator.pushNamed(context, "/wallet/topup"),
                  child: const Text("Buy Coins", style: TextStyle(fontSize: 12))),
              const SizedBox(width: 10),
              OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size(120, 38)),
                  onPressed: () => Navigator.pushNamed(context, "/wallet/sell"),
                  child: const Text("Sell Coins", style: TextStyle(fontSize: 12))),
            ]),
          ]),
        ),
        const SizedBox(height: 14),
        _note(Icons.trending_up, GoogerColors.green, "1 Rupier Coin ≈ R 1.00 · Market rate updated hourly."),
        const SizedBox(height: 16),
        const SectionTitle(icon: Icons.people_outline, title: "Coin Sellers"),
        ...listings.map((l) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GoogerCard(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  const IconChip(Icons.person_outline, size: 38, color: GoogerColors.text),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(l.$1, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                        if (l.$4) ...[const SizedBox(width: 4), const VerifiedBadge(size: 13)],
                      ]),
                      Text("${l.$2} coins · rate ${l.$3.toStringAsFixed(2)}", style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                    ]),
                  ),
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 14)),
                    onPressed: () => Navigator.pushNamed(context, "/wallet/request"),
                    child: const Text("Request", style: TextStyle(fontSize: 10)),
                  ),
                ]),
              ),
            )),
        _note(Icons.verified_user_outlined, GoogerColors.sky, "Coin trades are held in escrow by Googer until both sides confirm. Never trade outside the app."),
      ]),
    );
  }
}

/* ───────────── Sell Coins ───────────── */

class SellCoinsScreen extends StatefulWidget {
  const SellCoinsScreen();

  @override
  State<SellCoinsScreen> createState() => _SellCoinsScreenState();
}

class _SellCoinsScreenState extends State<SellCoinsScreen> {
  final coins = TextEditingController();
  final rate = TextEditingController(text: "1.00");

  @override
  Widget build(BuildContext context) {
    final total = (double.tryParse(coins.text) ?? 0) * (double.tryParse(rate.text) ?? 0);
    final fee = total * 0.01;
    return Scaffold(
      appBar: AppBar(title: const Text("Sell Coins")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          child: Column(children: const [
            Overline("Sellable Coins", color: GoogerColors.dim),
            SizedBox(height: 4),
            Text("2,450", style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600, letterSpacing: -0.6, color: GoogerColors.text)),
          ]),
        ),
        const SizedBox(height: 16),
        const Overline("Coins to Sell"),
        const SizedBox(height: 6),
        TextField(controller: coins, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "0"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 14),
        const Overline("Rate per Coin (R)"),
        const SizedBox(height: 6),
        TextField(controller: rate, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "1.00"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 4),
        const Text("Market rate: R 1.00 · lower rates sell faster", style: TextStyle(fontSize: 10, color: GoogerColors.dim)),
        const SizedBox(height: 16),
        GoogerCard(
          child: Column(children: [
            Row(children: [
              const Text("Listing value", style: TextStyle(fontSize: 12, color: GoogerColors.muted)),
              const Spacer(),
              Text("R ${total.toStringAsFixed(2)}", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Text("Escrow fee (1%)", style: TextStyle(fontSize: 12, color: GoogerColors.muted)),
              const Spacer(),
              Text("- R ${fee.toStringAsFixed(2)}", style: const TextStyle(fontSize: 12.5, color: Color(0xFFF87171))),
            ]),
            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
            Row(children: [
              const Text("You receive", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              const Spacer(),
              Text("R ${(total - fee).toStringAsFixed(2)}", style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: GoogerColors.green)),
            ]),
          ]),
        ),
        const SizedBox(height: 14),
        _note(Icons.lock_outline, GoogerColors.sky, "Coins are locked in escrow while listed. Funds are released to your wallet when the buyer confirms."),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: (double.tryParse(coins.text) ?? 0) > 0 ? () => Navigator.pushNamed(context, "/wallet/coins") : null,
          child: const Text("List for Sale"),
        ),
      ]),
    );
  }
}

/* ───────────── Coin Requests ───────────── */

class CoinRequestScreen extends StatelessWidget {
  const CoinRequestScreen();

  @override
  Widget build(BuildContext context) {
    const requests = [("@coin_hub", 1000, 970.0, "Awaiting seller", "2h ago", false), ("@nimasha", 500, 490.0, "Completed", "3 days ago", true)];
    return Scaffold(
      appBar: AppBar(title: const Text("Coin Requests")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        _labeledField("Seller (@username or Googer ID)", "@coin_hub"),
        _labeledField("Coins Needed", "0", type: TextInputType.number),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text("Send Request")),
        const SizedBox(height: 22),
        const Overline("My Requests"),
        const SizedBox(height: 10),
        ...requests.map((r) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GoogerCard(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: (r.$6 ? GoogerColors.green : GoogerColors.amber).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(r.$6 ? Icons.check : Icons.hourglass_empty, size: 16, color: r.$6 ? GoogerColors.green : GoogerColors.amber),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text("${r.$2} coins from ${r.$1}", style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                      Text("R ${r.$3.toStringAsFixed(0)} · ${r.$5}", style: const TextStyle(fontSize: 10, color: GoogerColors.dim)),
                    ]),
                  ),
                  StatusPill(r.$4, r.$6 ? GoogerColors.green : GoogerColors.amber),
                ]),
              ),
            )),
      ]),
    );
  }
}
