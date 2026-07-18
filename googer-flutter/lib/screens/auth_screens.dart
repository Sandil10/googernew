import 'package:flutter/material.dart';
import '../api/api.dart';
import '../theme.dart';
import '../widgets/kit.dart';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class LoginScreen extends StatefulWidget {
  const LoginScreen();

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  final otp = TextEditingController();
  bool showPassword = false;
  bool loading = false;
  bool otpStep = false;
  String? error;

  Future<void> _login() async {
    if (email.text.isEmpty || password.text.isEmpty) {
      setState(() => error = "Please enter your email and password or passkey.");
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    final err = otpStep
        ? await Api.verifyLoginOtp(
            email.text.trim(), password.text, otp.text.trim())
        : await Api.login(email.text.trim(), password.text);
    if (!mounted) return;
    if (err != null) {
      if (err.startsWith("OTP_REQUIRED|")) {
        setState(() {
          loading = false;
          otpStep = true;
          error = err.substring("OTP_REQUIRED|".length);
        });
        return;
      }
      setState(() {
        loading = false;
        error = err;
      });
      return;
    }
    Navigator.pushReplacementNamed(context, "/home");
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: GoogerColors.border),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                // Real Googer logo with glow
                SizedBox(
                  width: 100,
                  height: 100,
                  child: Stack(alignment: Alignment.center, children: [
                    Container(
                      width: 78,
                      height: 78,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                              color: GoogerColors.red.withValues(alpha: 0.30),
                              blurRadius: 44)
                        ],
                      ),
                    ),
                    Image.asset("assets/images/googer.png",
                        width: 84,
                        height: 84,
                        errorBuilder: (_, __, ___) => const Text("G",
                            style: TextStyle(
                                fontSize: 38,
                                fontWeight: FontWeight.w600,
                                color: GoogerColors.text))),
                  ]),
                ),
                const SizedBox(height: 22),
                if (error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12)),
                    child: Text(error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF111111))),
                  ),
                  const SizedBox(height: 14),
                ],
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(hintText: "Enter Email"),
                  style:
                      const TextStyle(fontSize: 14, color: GoogerColors.text),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: password,
                  enabled: !otpStep,
                  obscureText: !showPassword,
                  decoration: InputDecoration(
                    hintText: "Password or 6-digit passkey",
                    suffixIcon: IconButton(
                      icon: Icon(
                          showPassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: 19,
                          color: GoogerColors.dim),
                      onPressed: () =>
                          setState(() => showPassword = !showPassword),
                    ),
                  ),
                  style:
                      const TextStyle(fontSize: 14, color: GoogerColors.text),
                ),
                if (otpStep) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: otp,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                        hintText: "Enter Email OTP", counterText: ""),
                    style:
                        const TextStyle(fontSize: 14, color: GoogerColors.text),
                    onSubmitted: (_) => loading ? null : _login(),
                  ),
                ],
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: GestureDetector(
                    onTap: () {
                      if (otpStep) {
                        setState(() {
                          otpStep = false;
                          otp.clear();
                          error = null;
                        });
                        return;
                      }
                      Navigator.pushNamed(context, "/forgot-password");
                    },
                    child: Text(
                      otpStep ? "Change email or password" : "Forgot password?",
                      style: const TextStyle(
                          fontSize: 11, color: GoogerColors.dim),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: loading ? null : _login,
                  child: loading
                      ? const GoogerSpinner(size: 18, color: Color(0xFF111111))
                      : Text(otpStep ? "Verify OTP" : "Log In"),
                ),
                const SizedBox(height: 20),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Text("New to Googer? â€” ",
                      style: TextStyle(fontSize: 12, color: GoogerColors.dim)),
                  GestureDetector(
                    onTap: () => Navigator.pushNamed(context, "/register"),
                    child: const Text("Create Account",
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: GoogerColors.red)),
                  ),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen();

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final email = TextEditingController();
  final otp = TextEditingController();
  final next = TextEditingController();
  final confirm = TextEditingController();
  int step = 1;
  bool loading = false;
  String? error;
  String? debugOtp;
  String? resetToken;

  Future<void> _requestOtp() async {
    if (!email.text.contains("@")) {
      setState(() => error = "Enter your login email.");
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    final result = await Api.requestPasswordResetOtp(email.text.trim());
    if (!mounted) return;
    setState(() {
      loading = false;
      debugOtp = result.debugOtp;
      if (result.error == null) {
        step = 2;
      } else {
        error = result.error;
      }
    });
  }

  Future<void> _verifyOtp() async {
    if (otp.text.trim().length != 6) {
      setState(() => error = "Enter the 6-digit OTP.");
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    final result = await Api.verifyPasswordResetOtp(email.text.trim(), otp.text.trim());
    if (!mounted) return;
    setState(() {
      loading = false;
      if (result.error == null && result.resetToken != null) {
        resetToken = result.resetToken;
        step = 3;
      } else {
        error = result.error ?? "Could not verify OTP.";
      }
    });
  }

  Future<void> _reset() async {
    if (next.text.length < 8 || next.text != confirm.text || resetToken == null) {
      setState(() => error = "Enter matching passwords with at least 8 characters.");
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    final err = await Api.resetPasswordWithOtp(email.text.trim(), resetToken!, next.text);
    if (!mounted) return;
    setState(() => loading = false);
    if (err == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text("Password updated. Please log in."),
          behavior: SnackBarBehavior.floating));
      Navigator.pop(context);
    } else {
      setState(() => error = err);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = step == 1 ? "Reset Password" : step == 2 ? "Verify OTP" : "New Password";
    final subtitle = step == 1
        ? "Enter your Googer login email to receive a 6-digit OTP."
        : step == 2
            ? "We've sent a 6-digit code to ${email.text.trim()}."
            : "Secure your account with a new strong password.";
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text("Forgot Password"),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: GoogerCard(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(
                  step == 1
                      ? Icons.mail_outline
                      : step == 2
                          ? Icons.dialpad_outlined
                          : Icons.lock_outline,
                  size: 34,
                  color: step == 3 ? GoogerColors.green : Colors.white,
                ),
                const SizedBox(height: 14),
                Text(title,
                    style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w900,
                        color: Colors.white)),
                const SizedBox(height: 8),
                Text(subtitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 12.5, height: 1.45, color: GoogerColors.dim)),
                if (error != null) ...[
                  const SizedBox(height: 16),
                  Text(error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: GoogerColors.red)),
                ],
                const SizedBox(height: 22),
                if (step == 1)
                  TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(hintText: "Email address"),
                    style: const TextStyle(color: Colors.white),
                  )
                else if (step == 2)
                  TextField(
                    controller: otp,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    decoration: const InputDecoration(
                        hintText: "Enter 6-Digit OTP", counterText: ""),
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 8),
                  )
                else ...[
                  TextField(
                    controller: next,
                    obscureText: true,
                    decoration: const InputDecoration(hintText: "New Password"),
                    style: const TextStyle(color: Colors.white),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: confirm,
                    obscureText: true,
                    decoration: const InputDecoration(hintText: "Confirm New Password"),
                    style: const TextStyle(color: Colors.white),
                  ),
                ],
                if (debugOtp != null && step == 2) ...[
                  const SizedBox(height: 12),
                  Text("Debug OTP: $debugOtp",
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: GoogerColors.amber)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: loading
                      ? null
                      : step == 1
                          ? _requestOtp
                          : step == 2
                              ? _verifyOtp
                              : _reset,
                  child: loading
                      ? const GoogerSpinner(size: 18, color: Colors.black)
                      : Text(step == 1
                          ? "Send OTP"
                          : step == 2
                              ? "Verify & Continue"
                              : "Update Password"),
                ),
                const SizedBox(height: 14),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text("Back To Login"),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class RegisterScreen extends StatefulWidget {
  const RegisterScreen();

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  bool isSeller = false;
  bool acceptedTerms = false;
  bool showPassword = false;
  final email = TextEditingController();
  final shopName = TextEditingController();
  final password = TextEditingController();
  final confirm = TextEditingController();
  String? error;
  String pwd = "";

  static final policy = RegExp(r"^( =.*[a-z])( =.*[A-Z])( =.*\d).{8,}$");

  ({String label, Color color, int bars})? get strength {
    if (pwd.isEmpty) return null;
    if (pwd.length < 8) {
      return (label: "Weak", color: GoogerColors.red, bars: 1);
    }
    if (policy.hasMatch(pwd)) {
      return (label: "Strong", color: GoogerColors.greenDeep, bars: 3);
    }
    return (label: "Medium", color: GoogerColors.amber, bars: 2);
  }

  Future<void> _submit() async {
    if (password.text != confirm.text) {
      setState(() => error = "Passwords do not match");
      return;
    }
    if (!policy.hasMatch(password.text)) {
      setState(() =>
          error = "Password must be 8+ chars with upper, lower and a number.");
      return;
    }
    if (!acceptedTerms) {
      setState(() => error = "You must accept the Terms & Conditions");
      return;
    }
    final err = await Api.register({
      "email": email.text.trim(),
      "password": password.text,
      "username": email.text.trim().split("@").first,
      "fullName": isSeller ? shopName.text : email.text.trim().split("@").first,
      "isSeller": isSeller,
      if (isSeller) "shopName": shopName.text,
    });
    if (!mounted) return;
    if (err != null) {
      setState(() => error = err);
      return;
    }
    Navigator.pushReplacementNamed(context, "/home");
  }

  @override
  Widget build(BuildContext context) {
    final s = strength;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: GoogerColors.border),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Image.asset("assets/images/googer.png",
                    width: 72,
                    height: 72,
                    errorBuilder: (_, __, ___) => const Text("G",
                        style: TextStyle(
                            fontSize: 34,
                            fontWeight: FontWeight.w600,
                            color: GoogerColors.text))),
                const SizedBox(height: 18),
                if (error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12)),
                    child: Text(error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF111111))),
                  ),
                  const SizedBox(height: 12),
                ],
                // User / Seller toggle
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: GoogerColors.input,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GoogerColors.border),
                  ),
                  child: Row(
                    children: ["User", "Seller"].map((mode) {
                      final active = (mode == "Seller") == isSeller;
                      return Expanded(
                        child: GestureDetector(
                          onTap: () =>
                              setState(() => isSeller = mode == "Seller"),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 9),
                            decoration: BoxDecoration(
                              color: active ? Colors.white : Colors.transparent,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            alignment: Alignment.center,
                            child: Text(mode,
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: active
                                        ? const Color(0xFF111111)
                                        : GoogerColors.dim)),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(hintText: "Enter Email"),
                  style:
                      const TextStyle(fontSize: 14, color: GoogerColors.text),
                ),
                if (isSeller) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: shopName,
                    decoration:
                        const InputDecoration(hintText: "Enter Shop Name"),
                    style:
                        const TextStyle(fontSize: 14, color: GoogerColors.text),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: password,
                  obscureText: !showPassword,
                  onChanged: (v) => setState(() => pwd = v),
                  decoration: InputDecoration(
                    hintText: "Enter Password",
                    suffixIcon: IconButton(
                      icon: Icon(
                          showPassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: 19,
                          color: GoogerColors.dim),
                      onPressed: () =>
                          setState(() => showPassword = !showPassword),
                    ),
                  ),
                  style:
                      const TextStyle(fontSize: 14, color: GoogerColors.text),
                ),
                if (s != null) ...[
                  const SizedBox(height: 6),
                  Row(children: [
                    const Overline("Security Strength",
                        color: GoogerColors.dim),
                    const Spacer(),
                    Overline(s.label, color: s.color),
                  ]),
                  const SizedBox(height: 3),
                  Row(
                    children: List.generate(3, (i) {
                      return Expanded(
                        child: Container(
                          height: 2,
                          margin: EdgeInsets.only(right: i < 2 ? 2 : 0),
                          decoration: BoxDecoration(
                            color: i < s.bars ? s.color : GoogerColors.soft10,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      );
                    }),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: confirm,
                  obscureText: !showPassword,
                  decoration:
                      const InputDecoration(hintText: "Confirm Password"),
                  style:
                      const TextStyle(fontSize: 14, color: GoogerColors.text),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Switch(
                      value: acceptedTerms,
                      onChanged: (v) => setState(() => acceptedTerms = v)),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text.rich(TextSpan(
                      text: "I accept the ",
                      style: const TextStyle(
                          fontSize: 11, color: GoogerColors.dim),
                      children: [
                        TextSpan(
                            text: "Terms & Conditions",
                            style: TextStyle(
                                color: GoogerColors.red,
                                fontWeight: FontWeight.w600)),
                      ],
                    )),
                  ),
                ]),
                const SizedBox(height: 10),
                FilledButton(onPressed: _submit, child: const Text("Create")),
                const SizedBox(height: 18),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Text("Already have account? â€” ",
                      style: TextStyle(fontSize: 12, color: GoogerColors.dim)),
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: const Text("Login",
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: GoogerColors.red)),
                  ),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Suspended â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class SuspendedScreen extends StatelessWidget {
  const SuspendedScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: GoogerColors.surface,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: GoogerColors.line),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    color: GoogerColors.red.withValues(alpha: 0.10),
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: GoogerColors.red.withValues(alpha: 0.25)),
                  ),
                  child: const Icon(Icons.block,
                      size: 38, color: GoogerColors.red),
                ),
                const SizedBox(height: 18),
                const Text("Account Suspended",
                    style: TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w600,
                        color: GoogerColors.text)),
                const SizedBox(height: 10),
                const Text(
                  "Your Googer account has been suspended for violating our community guidelines. If you believe this is a mistake, you can appeal or contact support.",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 13, height: 1.5, color: GoogerColors.muted),
                ),
                const SizedBox(height: 20),
                GoogerCard(
                  color: GoogerColors.soft,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Overline("What you can still do",
                            color: GoogerColors.dim),
                        SizedBox(height: 8),
                        Text("â€¢ Access your wallet balance (if permitted)",
                            style: TextStyle(
                                fontSize: 12,
                                height: 1.6,
                                color: GoogerColors.muted)),
                        Text("â€¢ Submit an appeal within 30 days",
                            style: TextStyle(
                                fontSize: 12,
                                height: 1.6,
                                color: GoogerColors.muted)),
                        Text("â€¢ Contact our support team",
                            style: TextStyle(
                                fontSize: 12,
                                height: 1.6,
                                color: GoogerColors.muted)),
                      ]),
                ),
                const SizedBox(height: 22),
                OutlinedButton(
                    onPressed: () =>
                        Navigator.pushNamed(context, "/wallet/my-wallet"),
                    child: const Text("Open Wallet")),
                const SizedBox(height: 10),
                OutlinedButton(
                    onPressed: () =>
                        Navigator.pushNamed(context, "/help-support"),
                    child: const Text("Contact Support")),
                const SizedBox(height: 10),
                FilledButton(
                  style: FilledButton.styleFrom(
                      backgroundColor: GoogerColors.red,
                      foregroundColor: Colors.white),
                  onPressed: () => Navigator.pushNamedAndRemoveUntil(
                      context, "/login", (_) => false),
                  child: const Text("Log Out"),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
