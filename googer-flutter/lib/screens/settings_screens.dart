import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../widgets/kit.dart';

/* ───────────── Settings (General / Password / Privacy / Security) ───────────── */

class SettingsScreen extends StatefulWidget {
  const SettingsScreen();

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String tab = "General";
  bool darkMode = true, pushNotifs = true, privateAccount = false, showActivity = true, readReceipts = true;

  /// POST /auth/self-deactivate after an explicit confirmation, then log out.
  Future<void> _confirmDeactivate(BuildContext context) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: GoogerColors.surface,
        title: const Text("Deactivate account?", style: TextStyle(fontSize: 15, color: GoogerColors.text)),
        content: const Text(
            "Your profile, googs, and products will be hidden until you log in again. This does not delete your data.",
            style: TextStyle(fontSize: 12.5, height: 1.5, color: GoogerColors.muted)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text("Deactivate", style: TextStyle(color: GoogerColors.red))),
        ],
      ),
    );
    if (yes != true || !context.mounted) return;
    final err = await Api.selfDeactivate();
    if (!context.mounted) return;
    if (err == null) {
      Api.logout();
      Navigator.pushNamedAndRemoveUntil(context, "/login", (_) => false);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), behavior: SnackBarBehavior.floating),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget group(List<Widget> children) => GoogerCard(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(children: children),
        );
    Widget sw(bool v, ValueChanged<bool> f) => Switch(value: v, onChanged: f);

    final content = switch (tab) {
      "General" => [
          GoogerListRow(icon: Icons.person_outline, title: "Edit Profile", subtitle: "Name, username, bio, photo", onTap: () => Navigator.pushNamed(context, "/profile/edit")),
          GoogerListRow(icon: Icons.mail_outline, title: "Change Login Email", subtitle: Api.email, onTap: () => Navigator.pushNamed(context, "/settings/change-email")),
          GoogerListRow(icon: Icons.dark_mode_outlined, title: "Dark Mode", subtitle: "Googer's default look", trailing: sw(darkMode, (v) => setState(() => darkMode = v))),
          GoogerListRow(icon: Icons.notifications_none, title: "Push Notifications", subtitle: "Likes, chats, wallet activity", trailing: sw(pushNotifs, (v) => setState(() => pushNotifs = v))),
          const GoogerListRow(icon: Icons.language, title: "Language", subtitle: "English"),
          GoogerListRow(icon: Icons.support_agent_outlined, title: "Help & Support", onTap: () => Navigator.pushNamed(context, "/help-support")),
          GoogerListRow(icon: Icons.description_outlined, title: "Terms & Policies", onTap: () => Navigator.pushNamed(context, "/terms")),
        ],
      "Password" => [
          GoogerListRow(icon: Icons.key_outlined, title: "Reset Password", subtitle: "Change your login password", onTap: () => Navigator.pushNamed(context, "/settings/reset-password")),
          GoogerListRow(icon: Icons.fingerprint, title: "Passkeys", subtitle: "Passwordless sign-in with biometrics", onTap: () => Navigator.pushNamed(context, "/settings/passkeys")),
          GoogerListRow(icon: Icons.shield_outlined, title: "Two-Factor Authentication", subtitle: "Extra login protection", onTap: () => Navigator.pushNamed(context, "/settings/two-factor")),
        ],
      "Privacy" => [
          GoogerListRow(icon: Icons.lock_outline, title: "Private Account", subtitle: "Only followers see your Googs", trailing: sw(privateAccount, (v) => setState(() => privateAccount = v))),
          GoogerListRow(icon: Icons.visibility_outlined, title: "Show Activity Status", subtitle: "Let others see when you're online", trailing: sw(showActivity, (v) => setState(() => showActivity = v))),
          GoogerListRow(icon: Icons.done_all, title: "Read Receipts", subtitle: "Show when you've read chats", trailing: sw(readReceipts, (v) => setState(() => readReceipts = v))),
          const GoogerListRow(icon: Icons.block_outlined, title: "Blocked Accounts", subtitle: "0 blocked"),
          const GoogerListRow(icon: Icons.download_outlined, title: "Download My Data"),
        ],
      _ => [
          GoogerListRow(icon: Icons.warning_amber_outlined, iconColor: GoogerColors.amber, title: "Security Alerts", subtitle: "Login & account activity alerts", onTap: () => Navigator.pushNamed(context, "/settings/security-alerts")),
          GoogerListRow(icon: Icons.devices_outlined, title: "Trusted Devices", subtitle: "3 devices signed in", onTap: () => Navigator.pushNamed(context, "/settings/trusted-devices")),
          GoogerListRow(icon: Icons.shield_outlined, title: "Two-Factor Authentication", subtitle: "Off", onTap: () => Navigator.pushNamed(context, "/settings/two-factor")),
          GoogerListRow(icon: Icons.fingerprint, title: "Passkeys", subtitle: "1 passkey registered", onTap: () => Navigator.pushNamed(context, "/settings/passkeys")),
          GoogerListRow(icon: Icons.location_on_outlined, title: "Device Location Map", subtitle: "Where your sessions are active", onTap: () => Navigator.pushNamed(context, "/settings/trusted-devices")),
        ],
    };

    return Scaffold(
      appBar: AppBar(title: const Text("Settings")),
      body: ListView(padding: const EdgeInsets.all(14), children: [
        ChoiceChipRow(
          options: const ["General", "Password", "Privacy", "Security"],
          selected: tab,
          onSelect: (t) => setState(() => tab = t),
        ),
        const SizedBox(height: 14),
        group(content),
        const SizedBox(height: 14),
        group([
          GoogerListRow(
            icon: Icons.pause_circle_outline,
            title: "Deactivate Account",
            subtitle: "Temporarily hide your profile",
            onTap: () => _confirmDeactivate(context),
          ),
          GoogerListRow(
            icon: Icons.logout,
            title: "Log Out",
            danger: true,
            onTap: () {
              Api.logout();
              Navigator.pushNamedAndRemoveUntil(context, "/login", (_) => false);
            },
          ),
        ]),
        const SizedBox(height: 20),
        const Center(child: Text("Googer Flutter v1.0.0", style: TextStyle(fontSize: 10, color: GoogerColors.dim))),
      ]),
    );
  }
}

/* ───────────── Reset password ───────────── */

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen();

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final current = TextEditingController();
  final next = TextEditingController();
  final confirm = TextEditingController();
  bool show = false;
  bool saving = false;

  Future<void> _submit() async {
    if (saving) return;
    setState(() => saving = true);
    final err = await Api.changePassword(current.text, next.text);
    if (!mounted) return;
    setState(() => saving = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(err ?? "Password updated — use it next time you log in"),
      behavior: SnackBarBehavior.floating,
    ));
    if (err == null) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final rules = [
      (next.text.length >= 8, "At least 8 characters"),
      (RegExp(r"[A-Z]").hasMatch(next.text) && RegExp(r"[a-z]").hasMatch(next.text), "Upper & lowercase letters"),
      (RegExp(r"\d").hasMatch(next.text), "At least one number"),
      (next.text.isNotEmpty && next.text == confirm.text, "Passwords match"),
    ];
    final valid = rules.every((r) => r.$1) && current.text.isNotEmpty;
    Widget pwField(TextEditingController c, String hint) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: TextField(
            controller: c,
            obscureText: !show,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: hint,
              suffixIcon: c == current
                  ? IconButton(
                      icon: Icon(show ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19, color: GoogerColors.dim),
                      onPressed: () => setState(() => show = !show))
                  : null,
            ),
            style: const TextStyle(fontSize: 14, color: GoogerColors.text),
          ),
        );
    return Scaffold(
      appBar: AppBar(title: const Text("Reset Password")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        const Overline("Current Password"),
        const SizedBox(height: 6),
        pwField(current, "Current password"),
        const Overline("New Password"),
        const SizedBox(height: 6),
        pwField(next, "New password"),
        const Overline("Confirm New Password"),
        const SizedBox(height: 6),
        pwField(confirm, "Repeat new password"),
        GoogerCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: rules
                .map((r) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(children: [
                        Icon(r.$1 ? Icons.check_circle : Icons.circle_outlined, size: 14, color: r.$1 ? GoogerColors.green : GoogerColors.dim),
                        const SizedBox(width: 8),
                        Text(r.$2, style: TextStyle(fontSize: 11.5, color: r.$1 ? GoogerColors.muted : GoogerColors.dim)),
                      ]),
                    ))
                .toList(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: valid && !saving ? _submit : null,
          child: saving
              ? const GoogerSpinner(size: 18, color: Color(0xFF111111))
              : const Text("Update Password"),
        ),
      ]),
    );
  }
}

/* ───────────── Change login email ───────────── */

class ChangeLoginEmailScreen extends StatefulWidget {
  const ChangeLoginEmailScreen();

  @override
  State<ChangeLoginEmailScreen> createState() => _ChangeLoginEmailScreenState();
}

class _ChangeLoginEmailScreenState extends State<ChangeLoginEmailScreen> {
  int step = 1;
  final code = TextEditingController();
  final newEmail = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("Change Login Email · Step $step of 2")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          child: Row(children: [
            const Icon(Icons.mail_outline, size: 18, color: GoogerColors.muted),
            const SizedBox(width: 12),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Overline("Current login email", color: GoogerColors.dim),
              const SizedBox(height: 3),
              Text(Api.email, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: GoogerColors.text)),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        if (step == 1) ...[
          const Text("We've sent a 6-digit verification code to your current email. Enter it below to continue.",
              style: TextStyle(fontSize: 12, height: 1.5, color: GoogerColors.muted)),
          const SizedBox(height: 14),
          TextField(
            controller: code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: "6-digit code", counterText: ""),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500, letterSpacing: 8, color: GoogerColors.text),
          ),
          const SizedBox(height: 14),
          FilledButton(onPressed: code.text.length == 6 ? () => setState(() => step = 2) : null, child: const Text("Verify Code")),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () {}, child: const Text("Resend Code")),
        ] else ...[
          const Overline("New Email Address"),
          const SizedBox(height: 6),
          TextField(
            controller: newEmail,
            keyboardType: TextInputType.emailAddress,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: "new@email.com"),
            style: const TextStyle(fontSize: 14, color: GoogerColors.text),
          ),
          const SizedBox(height: 12),
          const Text("A confirmation link will be sent to your new address. Your login email changes only after you confirm it.",
              style: TextStyle(fontSize: 12, height: 1.5, color: GoogerColors.muted)),
          const SizedBox(height: 14),
          FilledButton(onPressed: newEmail.text.contains("@") ? () => Navigator.pop(context) : null, child: const Text("Send Confirmation")),
        ],
      ]),
    );
  }
}

/* ───────────── Two-factor ───────────── */

class TwoFactorScreen extends StatefulWidget {
  const TwoFactorScreen();

  @override
  State<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends State<TwoFactorScreen> {
  bool enabled = false;
  String method = "app";

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Two-Factor Auth")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          child: Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: enabled ? GoogerColors.green.withValues(alpha: 0.12) : GoogerColors.soft6,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: enabled ? GoogerColors.green.withValues(alpha: 0.3) : GoogerColors.line),
              ),
              child: Icon(Icons.shield_outlined, size: 26, color: enabled ? GoogerColors.green : GoogerColors.muted),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text("Two-Factor Authentication", style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                const SizedBox(height: 4),
                Overline(enabled ? "Enabled" : "Disabled", color: enabled ? GoogerColors.green : GoogerColors.dim),
              ]),
            ),
            Switch(value: enabled, onChanged: (v) => setState(() => enabled = v)),
          ]),
        ),
        const SizedBox(height: 14),
        const Text("When enabled, logging in from a new device requires a one-time code in addition to your password.",
            style: TextStyle(fontSize: 12, height: 1.5, color: GoogerColors.muted)),
        if (enabled) ...[
          const SizedBox(height: 18),
          const Overline("Verification Method"),
          const SizedBox(height: 10),
          ...[
            (key: "app", label: "Authenticator App", desc: "Google Authenticator, Authy, 1Password", icon: Icons.smartphone),
            (key: "email", label: "Email Codes", desc: "Receive codes at your login email", icon: Icons.mail_outline),
          ].map((m) {
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
                    IconChip(m.icon, size: 38, color: GoogerColors.text),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(m.label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                        Text(m.desc, style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                      ]),
                    ),
                    Icon(active ? Icons.radio_button_checked : Icons.radio_button_off, size: 18, color: active ? Colors.white : GoogerColors.dim),
                  ]),
                ),
              ),
            );
          }),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: GoogerColors.amber.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: GoogerColors.amber.withValues(alpha: 0.2)),
            ),
            child: Row(children: [
              const Icon(Icons.article_outlined, size: 16, color: GoogerColors.amber),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                  Text("Backup Codes", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                  SizedBox(height: 2),
                  Text("10 single-use codes for when you lose access", style: TextStyle(fontSize: 10.5, color: GoogerColors.muted)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: GoogerColors.amber.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: GoogerColors.amber.withValues(alpha: 0.3)),
                ),
                child: const Text("Generate", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: GoogerColors.amber)),
              ),
            ]),
          ),
        ],
      ]),
    );
  }
}

/* ───────────── Passkeys ───────────── */

class PasskeysScreen extends StatelessWidget {
  const PasskeysScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Passkeys")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: GoogerColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GoogerColors.sky.withValues(alpha: 0.25)),
          ),
          child: Column(children: [
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(color: GoogerColors.sky.withValues(alpha: 0.1), shape: BoxShape.circle),
              child: const Icon(Icons.fingerprint, size: 28, color: GoogerColors.sky),
            ),
            const SizedBox(height: 12),
            const Text("Sign in without a password", style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: GoogerColors.text)),
            const SizedBox(height: 6),
            const Text("Passkeys use your device's fingerprint, face unlock, or PIN. They can't be phished or leaked.",
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, height: 1.5, color: GoogerColors.muted)),
          ]),
        ),
        const SizedBox(height: 16),
        const Overline("Your Passkeys"),
        const SizedBox(height: 10),
        GoogerCard(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            const IconChip(Icons.desktop_windows_outlined, size: 38, color: GoogerColors.text),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                Text("Windows Hello", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                Text("Added Mar 2026 · Used 2 hours ago", style: TextStyle(fontSize: 10, color: GoogerColors.dim)),
              ]),
            ),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: GoogerColors.red.withValues(alpha: 0.08), shape: BoxShape.circle),
              child: const Icon(Icons.delete_outline, size: 15, color: GoogerColors.red),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: () {}, child: const Text("Add New Passkey")),
        const SizedBox(height: 12),
        const Text("You'll be asked to confirm with your device's screen lock. Each device needs its own passkey.",
            textAlign: TextAlign.center, style: TextStyle(fontSize: 10.5, height: 1.5, color: GoogerColors.dim)),
      ]),
    );
  }
}

/* ───────────── Trusted devices ───────────── */

class TrustedDevicesScreen extends StatefulWidget {
  const TrustedDevicesScreen();

  @override
  State<TrustedDevicesScreen> createState() => _TrustedDevicesScreenState();
}

class _TrustedDevicesScreenState extends State<TrustedDevicesScreen> {
  List<Map<String, dynamic>>? sessions; // null = still loading / demo fallback

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await Api.authSessions();
    if (mounted) setState(() => sessions = s.isEmpty ? null : s);
  }

  Future<void> _revoke(String id) async {
    final ok = await Api.removeSession(id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok ? "Session revoked" : "Could not revoke session"),
      behavior: SnackBarBehavior.floating,
    ));
    if (ok) _load();
  }

  Future<void> _logoutOthers() async {
    final ok = await Api.logoutOtherSessions();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok ? "All other devices signed out" : "Log in to manage sessions"),
      behavior: SnackBarBehavior.floating,
    ));
    if (ok) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Trusted Devices")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        GoogerCard(
          padding: const EdgeInsets.symmetric(vertical: 34),
          child: Column(children: [
            const Icon(Icons.map_outlined, size: 30, color: GoogerColors.faint),
            const SizedBox(height: 6),
            const Overline("Session locations", color: GoogerColors.dim),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: GoogerColors.soft6,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: GoogerColors.line),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: const [
                Icon(Icons.location_on, size: 14, color: GoogerColors.red),
                SizedBox(width: 5),
                Text("Colombo, LK · 2 sessions", style: TextStyle(fontSize: 10, color: GoogerColors.muted)),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        const Overline("Devices"),
        const SizedBox(height: 10),
        // real sessions from GET /auth/sessions when logged in, demo cards otherwise
        if (sessions != null)
          ...sessions!.map((s) {
            final isCurrent = s["current"] == true || s["is_current"] == true;
            final name = (s["device_name"] ?? s["deviceName"] ?? s["user_agent"] ?? "Device").toString();
            final loc = (s["location"] ?? s["ip_address"] ?? s["ip"] ?? "Unknown location").toString();
            final last = (s["last_active"] ?? s["updated_at"] ?? "").toString().split("T").first;
            final id = "${s["id"] ?? ""}";
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: GoogerColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: isCurrent ? GoogerColors.green.withValues(alpha: 0.35) : GoogerColors.border),
                ),
                child: Row(children: [
                  const IconChip(Icons.devices_outlined, size: 40, color: GoogerColors.text),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Flexible(
                          child: Text(name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                        ),
                        if (isCurrent) ...[
                          const SizedBox(width: 6),
                          const StatusPill("This device", GoogerColors.green),
                        ],
                      ]),
                      const SizedBox(height: 3),
                      Text("$loc · $last", style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                    ]),
                  ),
                  if (!isCurrent && id.isNotEmpty)
                    GestureDetector(
                      onTap: () => _revoke(id),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                        decoration: BoxDecoration(
                          color: GoogerColors.red.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: GoogerColors.red.withValues(alpha: 0.25)),
                        ),
                        child: const Text("Revoke",
                            style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w500, color: GoogerColors.red)),
                      ),
                    ),
                ]),
              ),
            );
          })
        else
        ...trustedDevices.map((d) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: GoogerColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: d.current ? GoogerColors.green.withValues(alpha: 0.35) : GoogerColors.border),
                ),
                child: Row(children: [
                  // ignore: non_const_argument_for_const_parameter
                  IconChip(IconData(d.icon, fontFamily: "MaterialIcons"), size: 40, color: GoogerColors.text),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(d.name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                        if (d.current) ...[
                          const SizedBox(width: 6),
                          const StatusPill("This device", GoogerColors.green),
                        ],
                      ]),
                      const SizedBox(height: 3),
                      Text("${d.location} · ${d.lastActive}", style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                    ]),
                  ),
                  if (!d.current)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                      decoration: BoxDecoration(
                        color: GoogerColors.red.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: GoogerColors.red.withValues(alpha: 0.25)),
                      ),
                      child: const Text("Revoke", style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w500, color: GoogerColors.red)),
                    ),
                ]),
              ),
            )),
        const SizedBox(height: 8),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: GoogerColors.red, foregroundColor: Colors.white),
          onPressed: _logoutOthers,
          child: const Text("Sign Out All Other Devices"),
        ),
      ]),
    );
  }
}

/* ───────────── Security alerts ───────────── */

class SecurityAlertsScreen extends StatelessWidget {
  const SecurityAlertsScreen();

  @override
  Widget build(BuildContext context) {
    Color sevColor(String s) => s == "high" ? const Color(0xFFF87171) : s == "medium" ? GoogerColors.amber : GoogerColors.blue;
    IconData sevIcon(String s) => s == "high" ? Icons.warning_amber_outlined : s == "medium" ? Icons.error_outline : Icons.info_outline;
    return Scaffold(
      appBar: AppBar(title: const Text("Security Alerts")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        ...securityAlerts.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GoogerCard(
                padding: const EdgeInsets.all(14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(color: sevColor(a.severity).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(11)),
                    child: Icon(sevIcon(a.severity), size: 17, color: sevColor(a.severity)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(a.title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      const SizedBox(height: 3),
                      Text(a.detail, style: const TextStyle(fontSize: 11, color: GoogerColors.muted)),
                      const SizedBox(height: 4),
                      Text(a.time, style: const TextStyle(fontSize: 9.5, color: GoogerColors.dim)),
                    ]),
                  ),
                  StatusPill(a.severity, sevColor(a.severity)),
                ]),
              ),
            )),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: GoogerColors.green.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: GoogerColors.green.withValues(alpha: 0.18)),
          ),
          child: Row(children: const [
            Icon(Icons.verified_user_outlined, size: 16, color: GoogerColors.green),
            SizedBox(width: 10),
            Expanded(
              child: Text("If you don't recognize an activity, revoke the device in Trusted Devices and reset your password immediately.",
                  style: TextStyle(fontSize: 11, height: 1.5, color: GoogerColors.muted)),
            ),
          ]),
        ),
      ]),
    );
  }
}
