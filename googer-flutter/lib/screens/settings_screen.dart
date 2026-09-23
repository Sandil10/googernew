import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api.dart';
import '../services/app_notifications.dart';
import '../util/ad_countries.dart';
import '../util/profile_photo_picker.dart';
import '../widgets/app_back_button.dart';
import '../theme/colors.dart';
import 'login_screen.dart';

/// Settings — live port of the web `dashboard/settings`.
/// Account, security (password + OTP-gated actions), device sessions,
/// subscription/verification shortcuts and the danger zone.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  // Same four tabs as the web settings page.
  int _tab = 0;
  static const _tabs = ['General', 'Notifications', 'Privacy', 'Security'];

  bool _savingGeneral = false;
  bool _generalSaved = false;
  bool _savingPrivacy = false;
  bool _savingNotifications = false;
  bool _biometricUnlock = false;
  bool _biometricWallet = false;

  // General — field names mirror the web `generalForm`.
  final _username = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _contactEmail = TextEditingController();
  final _phoneNumber = TextEditingController();
  final _country = TextEditingController();
  final _province = TextEditingController();
  final _dateOfBirth = TextEditingController();
  final _bio = TextEditingController();

  /// Read-only mirrors of values the backend will not let this form change.
  final _registeredEmail = TextEditingController();
  final _googerIdField = TextEditingController();

  /// Profile links, shown in the web's "Add Link" block (max two).
  final _linkDraft = TextEditingController();
  final List<String> _links = [];

  /// Pending profile photo, exactly as the web stages it: "Upload Photo" picks
  /// a file and "Upload Link" pastes a URL, but neither is persisted until SAVE
  /// posts it with the rest of the General form.
  ApiUploadFile? _pendingPhoto;
  Uint8List? _pendingPhotoBytes;
  String _pendingPhotoLink = '';
  bool _pickingPhoto = false;

  /// Live username availability, the web's debounced `check-username` call.
  Timer? _usernameDebounce;
  String _usernameError = '';
  bool _checkingUsername = false;

  String _gender = '';
  String _relationship = '';
  String _contactEmailVisibility = 'public';
  String _contactPhoneVisibility = 'public';

  // Privacy
  String _whoCanFollowMe = 'everyone';
  String _whoCanSeeActivity = 'followers';

  // Notifications
  final Map<String, bool> _notifications = {
    'webPush': true,
    'appPush': true,
    'email': true,
    'chats': true,
    'security': true,
    'orders': true,
    'googs': true,
    'promotions': false,
  };

  static const _genderOptions = ['Male', 'Female', 'Other'];
  static const _relationshipOptions = [
    'Single',
    'Married',
    'In a Relationship',
    'Prefer not to say',
  ];
  static const _followOptions = ['everyone', 'followers', 'only_me'];
  static const _activityOptions = ['everyone', 'followers', 'only_me'];

  @override
  void initState() {
    super.initState();
    _applyUserToForms();
    _loadBiometricPrefs();
    // The web fetches `/auth/profile` when the page mounts; do the same so the
    // username lock, date-of-birth lock and notification toggles are the
    // server's current values rather than whatever the session cached.
    _reloadAccount();
  }

  Future<void> _loadBiometricPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _biometricUnlock = prefs.getBool('googer_biometric_unlock') ?? false;
      _biometricWallet = prefs.getBool('googer_biometric_wallet') ?? false;
    });
  }

  @override
  void dispose() {
    _usernameDebounce?.cancel();
    for (final c in [
      _username,
      _firstName,
      _lastName,
      _contactEmail,
      _phoneNumber,
      _country,
      _province,
      _dateOfBirth,
      _bio,
      _registeredEmail,
      _googerIdField,
      _linkDraft,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Fills the forms from the cached profile, using the same column names the
  /// web page reads.
  void _applyUserToForms() {
    final u = Api.user ?? const {};
    String s(List<String> keys) {
      for (final k in keys) {
        final v = '${u[k] ?? ''}'.trim();
        if (v.isNotEmpty) return v;
      }
      return '';
    }

    _username.text = s(['username']);
    _firstName.text = s(['first_name', 'firstName']);
    _lastName.text = s(['last_name', 'lastName']);
    _contactEmail.text = s(['contact_email', 'contactEmail']);
    _phoneNumber.text = s(['phone_number', 'phoneNumber', 'phone']);
    _country.text = s(['country']);
    _province.text = s(['province']);
    _dateOfBirth.text = s(['date_of_birth', 'dateOfBirth']).split('T').first;
    _registeredEmail.text = Api.email;
    _googerIdField.text = Api.googerId;
    // The web keeps profile links inside the bio; pull any URL lines out so the
    // Add Link block owns them and the bio box shows prose only.
    final bioLines = s(['bio']).split('\n');
    final urlPattern = RegExp(
      r'^(https?://\S+|www\.\S+)$',
      caseSensitive: false,
    );
    _links
      ..clear()
      ..addAll(
        bioLines.map((l) => l.trim()).where(urlPattern.hasMatch).take(2),
      );
    _bio.text = bioLines
        .where((l) => !urlPattern.hasMatch(l.trim()))
        .join('\n')
        .trim();
    _linkDraft.clear();
    _gender = s(['gender']);
    _relationship = s(['relationship_status', 'relationshipStatus']);
    _contactEmailVisibility = s(['contact_email_visibility']).isEmpty
        ? 'public'
        : s(['contact_email_visibility']);
    _contactPhoneVisibility = s(['contact_phone_visibility']).isEmpty
        ? 'public'
        : s(['contact_phone_visibility']);
    _whoCanFollowMe = s(['who_can_follow_me']).isEmpty
        ? 'everyone'
        : s(['who_can_follow_me']);
    // `notification_settings` is a jsonb column; the web merges it over the
    // defaults, so the toggles show what was actually saved instead of always
    // reverting to the built-in set.
    final saved = u['notification_settings'];
    Map<String, dynamic>? savedMap;
    if (saved is Map) {
      savedMap = Map<String, dynamic>.from(saved);
    } else if (saved is String && saved.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(saved);
        if (decoded is Map) savedMap = Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    if (savedMap != null) {
      for (final key in _notifications.keys.toList()) {
        final value = savedMap[key];
        if (value is bool) _notifications[key] = value;
      }
    }
    _whoCanSeeActivity = s(['who_can_see_activity']).isEmpty
        ? 'followers'
        : s(['who_can_see_activity']);
    // Drop anything staged but not saved — this doubles as the web's
    // `handleCancelGeneral`, which resets the form *and* the pending photo.
    _usernameDebounce?.cancel();
    _usernameError = '';
    _checkingUsername = false;
    _pendingPhoto = null;
    _pendingPhotoBytes = null;
    _pendingPhotoLink = '';
    if (mounted) setState(() {});
  }

  /// CANCEL on the General tab: restore every field from the saved profile and
  /// tell the user it happened, so the button is never a no-op.
  void _cancelGeneral() {
    _applyUserToForms();
    AppNotifications.info('Changes discarded', 'Profile details restored.');
  }

  // ── date helpers (mirrors of the web's date utilities) ─────────────────────

  static String _dateString(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';

  String get _todayDateString => _dateString(DateTime.now());

  /// `formatFriendlyDate` on the web — "12 Mar 1994" style, never a raw ISO
  /// string, for the date-of-birth button label.
  static String _formatFriendlyDate(String value) {
    if (value.isEmpty) return '';
    final parts = value.split('T').first.split('-');
    if (parts.length < 3) return value;
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (year == null || month == null || day == null) return value;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    if (month < 1 || month > 12) return value;
    return '$day ${months[month - 1]} $year';
  }

  /// The 14-day username lock the backend enforces
  /// (`username_next_change_at`), surfaced before the request is sent.
  String get _usernameNextChangeDate {
    final u = Api.user ?? const {};
    final explicit = '${u['username_next_change_at'] ?? ''}'.split('T').first;
    if (explicit.isNotEmpty) return explicit;
    final changedAt = '${u['username_changed_at'] ?? ''}'.split('T').first;
    if (changedAt.isEmpty) return '';
    final parsed = DateTime.tryParse(changedAt);
    if (parsed == null) return '';
    return _dateString(parsed.add(const Duration(days: 14)));
  }

  bool get _usernameChangeLocked {
    final next = _usernameNextChangeDate;
    return next.isNotEmpty && next.compareTo(_todayDateString) > 0;
  }

  String get _usernameHelpText {
    final next = _usernameNextChangeDate;
    if (_usernameChangeLocked) {
      return 'Username can be changed again on ${_formatFriendlyDate(next)}.';
    }
    if (next.isNotEmpty) {
      return 'After changing your username, you can change it again on '
          '${_formatFriendlyDate(next)}.';
    }
    return 'When you change your username, you can change it again after '
        '14 days.';
  }

  /// Debounced `GET /auth/check-username` — the same 350 ms the web waits, so
  /// "Username already exists" shows while typing instead of only on save.
  void _onUsernameChanged(String raw) {
    final value = raw.trim().toLowerCase();
    _usernameDebounce?.cancel();
    if (value.isEmpty || value == Api.username.toLowerCase()) {
      setState(() {
        _usernameError = '';
        _checkingUsername = false;
      });
      return;
    }
    setState(() => _checkingUsername = true);
    _usernameDebounce = Timer(const Duration(milliseconds: 350), () async {
      final available = await Api.checkUsername(value);
      if (!mounted || _username.text.trim().toLowerCase() != value) return;
      setState(() {
        _checkingUsername = false;
        _usernameError = available == false ? 'Username already exists' : '';
      });
    });
  }

  Future<void> _saveGeneral() async {
    // Same required set and same order of checks as the web's
    // `handleSaveGeneral`, so mobile refuses exactly what the web refuses.
    final username = _username.text.trim().toLowerCase();
    final dob = _dateOfBirth.text.trim();
    if (_firstName.text.trim().isEmpty ||
        username.isEmpty ||
        _country.text.trim().isEmpty ||
        dob.isEmpty ||
        _gender.trim().isEmpty) {
      AppNotifications.error(
        'First name, username, country, gender, and date of birth are '
        'required.',
      );
      return;
    }
    if (dob.compareTo(_todayDateString) > 0) {
      AppNotifications.error('Date of birth cannot be in the future.');
      return;
    }
    if (_bio.text.trim().characters.length > 50) {
      AppNotifications.error('Bio must be 50 characters or less.');
      return;
    }
    if (_links.length > 2) {
      AppNotifications.error('You can add a maximum of 2 links.');
      return;
    }
    if (_usernameError.isNotEmpty) {
      AppNotifications.error('Please choose a unique username.');
      return;
    }
    if (_usernameChangeLocked && username != Api.username.toLowerCase()) {
      AppNotifications.error(_usernameHelpText);
      return;
    }
    setState(() {
      _savingGeneral = true;
      _generalSaved = false;
    });
    final fullName = [
      _firstName.text.trim(),
      _lastName.text.trim(),
    ].where((p) => p.isNotEmpty).join(' ');
    final error = await Api.updateProfile({
      'username': username,
      'firstName': _firstName.text.trim(),
      'lastName': _lastName.text.trim(),
      'fullName': fullName,
      'contactEmail': _contactEmail.text.trim(),
      'phoneNumber': _phoneNumber.text.trim(),
      'country': _country.text.trim(),
      'province': _province.text.trim(),
      'dateOfBirth': dob,
      // Links live back inside the bio, the shape the backend and the web both
      // expect — the Add Link block is only how they are edited.
      'bio': [
        _bio.text.trim(),
        ..._links,
      ].where((l) => l.isNotEmpty).join('\n'),
      'gender': _gender,
      'relationshipStatus': _relationship,
      'contactEmailVisibility': _contactEmailVisibility,
      'contactPhoneVisibility': _contactPhoneVisibility,
      // The web posts the privacy pair with the General form too, so a save
      // here never resets what the Privacy tab last set.
      'whoCanFollowMe': _whoCanFollowMe,
      'whoCanSeeActivity': _whoCanSeeActivity,
      // A pasted link is stored as-is; an uploaded file wins over it because
      // the backend overwrites `profilePicture` with the saved upload.
      if (_pendingPhoto == null && _pendingPhotoLink.isNotEmpty)
        'profilePicture': _pendingPhotoLink,
    }, profilePhoto: _pendingPhoto);
    if (!mounted) return;
    setState(() => _savingGeneral = false);
    if (error != null) {
      AppNotifications.error('Could not save profile', error);
      return;
    }
    AppNotifications.success('General profile details updated');
    _applyUserToForms();
    setState(() => _generalSaved = true);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _generalSaved = false);
    });
  }

  Future<void> _savePrivacy() async {
    setState(() => _savingPrivacy = true);
    final error = await Api.updateProfile({
      'whoCanFollowMe': _whoCanFollowMe,
      'whoCanSeeActivity': _whoCanSeeActivity,
    });
    if (!mounted) return;
    setState(() => _savingPrivacy = false);
    AppNotifications.add(
      title: error ?? 'Privacy settings updated',
      type: error == null ? 'success' : 'error',
    );
  }

  Future<void> _saveNotifications() async {
    setState(() => _savingNotifications = true);
    final error = await Api.updateProfile({
      'notificationSettings': jsonEncode(_notifications),
    });
    if (!mounted) return;
    setState(() => _savingNotifications = false);
    AppNotifications.add(
      title: error ?? 'Notification settings updated',
      type: error == null ? 'success' : 'error',
    );
  }

  /// Pull-to-refresh on the Security tab. The device list now lives on its own
  /// page, so this just re-reads the account.
  Future<void> _reloadAccount() async {
    await Api.refreshProfile();
    if (mounted) _applyUserToForms();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        // The only "Settings" label on the page, sitting on the back-button
        // line — the old oversized header block below it is gone.
        title: const Text(
          'Settings',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
      ),
      body: Column(
        children: [
          _pageHeader(),
          Expanded(
            child: switch (_tab) {
              0 => _generalTab(),
              1 => _notificationsTab(),
              2 => _privacyTab(),
              _ => _securityTab(),
            },
          ),
        ],
      ),
    );
  }

  /// The web's page header: title, one-line caption and the shortcut back to
  /// the profile, over the pill tab carousel.
  Widget _pageHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      // Just the tab strip: the title lives on the app bar's back-button line
      // and the "Manage your profile and account." caption is gone.
      child: Column(children: [_pillTabs(), const SizedBox(height: 14)]),
    );
  }

  /// Rounded pill carousel — the active tab is a white pill with black text,
  /// exactly as the web draws it, and the strip scrolls when the four will not
  /// fit the width.
  Widget _pillTabs() {
    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (int i = 0; i < _tabs.length; i++)
              GestureDetector(
                onTap: () => setState(() => _tab = i),
                behavior: HitTestBehavior.opaque,
                child: Container(
                  margin: EdgeInsets.only(right: i == _tabs.length - 1 ? 0 : 6),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    color: _tab == i ? Colors.white : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: _tab == i ? Colors.white : AppColors.borderWhite10,
                    ),
                  ),
                  child: Text(
                    _tabs[i],
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: _tab == i ? Colors.black : Colors.white,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// A titled panel — every block of the web settings page lives in one.
  Widget _card({
    required String title,
    String? subtitle,
    required List<Widget> children,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 12,
                height: 1.45,
                color: AppColors.textGray500,
              ),
            ),
          ],
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _securityTab() {
    return RefreshIndicator(
      color: AppColors.textGray300,
      backgroundColor: AppColors.bg1,
      onRefresh: _reloadAccount,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 16, 14, 32),
        children: [
          _card(
            title: 'Security Settings',
            subtitle:
                'Manage login protection, trusted devices, and account recovery.',
            children: [
              _securityRow(
                Ionicons.shield_checkmark_outline,
                'Change Login Email',
                'Verify the current login email by OTP before updating login '
                    'email.',
                () => _push(const ChangeLoginEmailScreen()),
              ),
              _securityRow(
                Ionicons.notifications_outline,
                'Security Alerts',
                'Open Login History only, with 5 rows per page.',
                () => _push(const SecurityAlertsScreen()),
              ),
              _securityRow(
                Ionicons.phone_portrait_outline,
                'Trusted Devices',
                'Open logged devices only, with trusted controls and 5 rows '
                    'per page.',
                () => _push(const TrustedDevicesScreen()),
              ),
              _securityRow(
                Ionicons.key_outline,
                '6-Digit Passkey',
                'Verify current email OTP before saving your account passkey.',
                _passkeySheet,
              ),
              _securityRow(
                Ionicons.finger_print_outline,
                'Face ID & Fingerprint',
                'Set app unlock and wallet confirmation preferences.',
                _biometricsSheet,
              ),
              _securityRow(
                Ionicons.call_outline,
                '2FA',
                'Add a phone number and choose email or phone for future OTPs.',
                _twoFactorSheet,
              ),
              _securityRow(
                Ionicons.mail_outline,
                'Reset Password',
                'Verify current email OTP before creating a new password.',
                _resetPassword,
              ),
            ],
          ),
          _card(
            title: 'High-impact account actions',
            subtitle: 'Deactivate or permanently delete your account.',
            children: [
              _dangerButton(
                'DEACTIVATE ACCOUNT',
                const Color(0xFFEAB308),
                _deactivate,
              ),
              const SizedBox(height: 10),
              _dangerButton(
                'DELETE ACCOUNT',
                AppColors.likeRed,
                _deleteAccount,
              ),
              const SizedBox(height: 10),
              _dangerButton('LOG OUT', AppColors.textGray500, _logout),
            ],
          ),
        ],
      ),
    );
  }

  /// One row of the Security Settings panel: round icon chip, title and the
  /// grey explainer under it.
  Widget _securityRow(
    IconData icon,
    String title,
    String description,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.04),
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Icon(icon, size: 17, color: Colors.white),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Outlined, tinted button for the destructive actions.
  Widget _dangerButton(String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 52,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.45)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            letterSpacing: 1.6,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ),
    );
  }

  void _biometricsSheet() {
    bool unlockApp = _biometricUnlock;
    bool walletConfirm = _biometricWallet;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Face ID & Fingerprint',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 14),
                SwitchListTile.adaptive(
                  value: unlockApp,
                  onChanged: (v) => setSheet(() => unlockApp = v),
                  activeThumbColor: Colors.white,
                  title: const Text(
                    'Unlock Googer',
                    style: TextStyle(color: Colors.white, fontSize: 13),
                  ),
                ),
                SwitchListTile.adaptive(
                  value: walletConfirm,
                  onChanged: (v) => setSheet(() => walletConfirm = v),
                  activeThumbColor: Colors.white,
                  title: const Text(
                    'Confirm wallet actions',
                    style: TextStyle(color: Colors.white, fontSize: 13),
                  ),
                ),
                const SizedBox(height: 8),
                _saveButton('DONE', () async {
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setBool('googer_biometric_unlock', unlockApp);
                  await prefs.setBool('googer_biometric_wallet', walletConfirm);
                  if (!mounted || !sheetContext.mounted) return;
                  setState(() {
                    _biometricUnlock = unlockApp;
                    _biometricWallet = walletConfirm;
                  });
                  Navigator.maybePop(sheetContext);
                  AppNotifications.success('Biometric preferences updated');
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// 6-digit passkey, gated by an OTP on the current login email.
  void _passkeySheet() {
    _otpGatedSheet(
      purpose: 'passkey',
      title: '6-Digit Passkey',
      caption: 'Verify current email OTP before saving your account passkey.',
      valueLabel: 'Create 6-digit passkey',
      confirmLabel: 'Confirm passkey',
      obscureValue: true,
      submitLabel: 'SAVE PASSKEY',
      onSubmit: (value, securityToken) async {
        // Same guard as the web panel, which is also what `savePasskeyWithOtp`
        // enforces server-side with /^\d{6}$/.
        if (!RegExp(r'^\d{6}$').hasMatch(value.trim())) {
          return 'Passkey must be exactly 6 digits.';
        }
        return Api.savePasskeyWithOtp(value.trim(), securityToken);
      },
    );
  }

  /// 2FA — record a phone number and pick where future OTPs are sent. The web
  /// verifies the *email* first (purpose `setup_2fa_email`) and then posts the
  /// number to `security/two-factor-phone`.
  void _twoFactorSheet() {
    final u = Api.user ?? const {};
    var country = _dialCountryFor(
      '${u['two_factor_phone_country_code'] ?? ''}',
    );
    var delivery = '${u['otp_delivery_method'] ?? ''}'.trim() == 'phone'
        ? 'phone'
        : 'email';
    _otpGatedSheet(
      purpose: 'setup_2fa_email',
      title: '2FA',
      caption: 'Add a phone number and choose email or phone for future OTPs.',
      valueLabel: 'Phone number',
      submitLabel: 'SAVE PHONE NUMBER',
      stepTwoHeader: (setSheet, unlocked) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Opacity(
            opacity: unlocked ? 1 : 0.65,
            child: GestureDetector(
              // The web disables the country button until step 1 passes.
              onTap: unlocked
                  ? () async {
                      final picked = await _pickDialCountry(country);
                      if (picked != null) setSheet(() => country = picked);
                    }
                  : null,
              behavior: HitTestBehavior.opaque,
              child: Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 13,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF151515),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.inputBorder),
                ),
                child: Row(
                  children: [
                    Text(country.flag, style: const TextStyle(fontSize: 16)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        country.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    Text(
                      country.dial,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Icon(
                      Ionicons.chevron_down_outline,
                      size: 14,
                      color: AppColors.textGray500,
                    ),
                  ],
                ),
              ),
            ),
          ),
          _fieldLabel('Where future OTPs should arrive'),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _destinationPills(
              delivery,
              'this number',
              (option) => setSheet(() => delivery = option),
            ),
          ),
        ],
      ),
      onSubmit: (value, securityToken) {
        // The endpoint strips non-digits and a leading zero before it decides
        // the number is missing, so normalise first or a "0" would pass here
        // and still come back rejected.
        final digits = value
            .replaceAll(RegExp(r'[^\d]'), '')
            .replaceFirst(RegExp(r'^0+'), '');
        if (digits.isEmpty) return Future.value('Phone number is required.');
        return Api.saveTwoFactorPhone(
          emailSecurityToken: securityToken,
          countryCode: country.code,
          countryName: country.name,
          dialCode: country.dial,
          phoneNumber: digits,
          otpDeliveryMethod: delivery,
        );
      },
    );
  }

  // ── General ────────────────────────────────────────────────────────────────

  Widget _generalTab() {
    final googerId = Api.googerId;
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 32),
      children: [
        _accountCard(),
        const SizedBox(height: 18),
        _field(
          _bio,
          'Write a short profile intro with links, mentions, or hashtags.',
          label: 'Bio',
          maxLines: 3,
          maxLength: 50,
          counter: '${_bio.text.characters.length}/50',
        ),
        _linksBlock(),
        _field(
          _firstName,
          'First name',
          label: 'First name *',
          onChanged: (_) => setState(() {}),
          error: _firstName.text.trim().isEmpty
              ? 'First name is required'
              : null,
        ),
        _field(_lastName, 'Last name', label: 'Last name'),
        _field(
          _username,
          'Username',
          label: 'Username *',
          readOnly: _usernameChangeLocked,
          note: _usernameHelpText,
          onChanged: _onUsernameChanged,
          status: _checkingUsername ? 'Checking username…' : null,
          error: _usernameError.isNotEmpty
              ? _usernameError
              : (_username.text.trim().isEmpty ? 'Username is required' : null),
        ),
        _tapField(
          label: 'Date of birth *',
          value: _formatFriendlyDate(_dateOfBirth.text),
          placeholder: 'Select date of birth',
          icon: Ionicons.calendar_outline,
          onTap: _pickDateOfBirth,
          error: _dateOfBirth.text.trim().isEmpty
              ? 'Date of birth is required'
              : (_dateOfBirth.text.trim().compareTo(_todayDateString) > 0
                    ? 'Date of birth cannot be in the future'
                    : null),
        ),
        _tapField(
          label: 'Country *',
          value: _country.text.trim(),
          placeholder: 'Select country',
          icon: Ionicons.chevron_down_outline,
          onTap: _pickCountry,
          error: _country.text.trim().isEmpty ? 'Country is required' : null,
        ),
        _field(_province, 'Province', label: 'Province'),
        _field(
          _registeredEmail,
          'Registered email',
          label: 'Registered email',
          readOnly: true,
          note: 'Login email can only be changed from Security.',
        ),
        if (googerId.isNotEmpty)
          _field(
            _googerIdField,
            'Googer ID',
            label: 'Googer ID',
            readOnly: true,
            note: 'Googer ID cannot be changed.',
          ),
        _picker(
          'Gender *',
          _gender,
          _genderOptions,
          (v) => setState(() => _gender = v),
          error: _gender.trim().isEmpty ? 'Gender is required' : null,
        ),
        _picker(
          'Relationship status',
          _relationship,
          _relationshipOptions,
          (v) => setState(() => _relationship = v),
        ),
        const SizedBox(height: 6),
        _contactsCard(),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: _ghostButton(
                'CANCEL',
                _savingGeneral ? null : _cancelGeneral,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _saveButton(
                _savingGeneral
                    ? 'SAVING…'
                    : _generalSaved
                    ? 'SAVED'
                    : 'SAVE',
                _savingGeneral ? null : _saveGeneral,
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// The web's "Add Link" block — up to two profile links, appended to the bio
  /// the same way the web stores them.
  Widget _linksBlock() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Add Link',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 3),
            const Text(
              'Add up to 2 links.',
              style: TextStyle(fontSize: 11, color: AppColors.textGray500),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _linkDraft,
                    style: const TextStyle(fontSize: 12.5, color: Colors.white),
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      filled: true,
                      fillColor: const Color(0xFF151515),
                      hintText: 'your-site.com',
                      hintStyle: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textGray600,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.inputBorder,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.inputBorder,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                GestureDetector(
                  onTap: _links.length >= 2 ? null : _addLink,
                  child: Container(
                    height: 42,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(
                        _links.length >= 2 ? 0.03 : 0.08,
                      ),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: Text(
                      'ADD LINK',
                      style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                        color: _links.length >= 2
                            ? AppColors.textGray600
                            : Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${_links.length}/2 links added',
              style: const TextStyle(
                fontSize: 10.5,
                color: AppColors.textGray600,
              ),
            ),
            for (final link in _links)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    const Icon(
                      Ionicons.link_outline,
                      size: 13,
                      color: AppColors.linkBlue,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        link,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.linkBlue,
                        ),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => setState(() => _links.remove(link)),
                      child: const Icon(
                        Ionicons.close_outline,
                        size: 15,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _addLink() {
    final value = _linkDraft.text.trim();
    if (value.isEmpty || _links.length >= 2) return;
    setState(() {
      _links.add(value);
      _linkDraft.clear();
    });
  }

  /// Public contact details, grouped in their own card exactly as the web does.
  Widget _contactsCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Contacts',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 3),
          const Text(
            'Manage public contact details separately from your registered '
            'email.',
            style: TextStyle(
              fontSize: 11,
              height: 1.4,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 12),
          _visibilityToggle(
            'CONTACT EMAIL',
            _contactEmailVisibility,
            (v) => setState(() => _contactEmailVisibility = v),
          ),
          _field(_contactEmail, 'Contact email'),
          _visibilityToggle(
            'PHONE NUMBER',
            _contactPhoneVisibility,
            (v) => setState(() => _contactPhoneVisibility = v),
          ),
          _field(_phoneNumber, 'Phone number'),
        ],
      ),
    );
  }

  Widget _ghostButton(String label, VoidCallback? onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: Container(
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  Widget _notificationsTab() {
    // Title + description per row, word for word with the web page.
    const rows = <(String, String, String)>[
      (
        'webPush',
        'Web notifications',
        'Browser alerts on desktop and mobile web.',
      ),
      (
        'appPush',
        'iPhone app notifications',
        'Push alerts for the mobile app.',
      ),
      ('email', 'Email notifications', 'Important account updates by email.'),
      ('chats', 'Chats', 'Messages, replies, and chat requests.'),
      ('security', 'Security', 'Login, OTP, device, and account alerts.'),
      (
        'orders',
        'Orders and wallet',
        'Purchases, wallet, coins, and payments.',
      ),
      (
        'googs',
        'Googs and content',
        'Likes, comments, reposts, and upload activity.',
      ),
      (
        'promotions',
        'Promotions',
        'Campaign tips, subscription offers, and news.',
      ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 32),
      children: [
        _card(
          title: 'Notifications',
          subtitle: 'Choose alerts for web and iPhone app experiences.',
          children: [
            for (final (key, title, description) in rows)
              _checkRow(
                title,
                description,
                _notifications[key] ?? false,
                (v) => setState(() => _notifications[key] = v),
              ),
            const SizedBox(height: 6),
            _saveButton(
              _savingNotifications ? 'SAVING…' : 'SAVE NOTIFICATIONS',
              _savingNotifications ? null : _saveNotifications,
            ),
          ],
        ),
      ],
    );
  }

  /// A bordered row with a title, a description and the web's square checkbox.
  Widget _checkRow(
    String title,
    String description,
    bool value,
    ValueChanged<bool> onChanged,
  ) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 14),
            Container(
              width: 24,
              height: 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: value ? Colors.white : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: value ? Colors.white : AppColors.textGray600,
                  width: 1.5,
                ),
              ),
              child: value
                  ? const Icon(
                      Ionicons.checkmark_outline,
                      size: 15,
                      color: Colors.black,
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  // ── Privacy ────────────────────────────────────────────────────────────────

  Widget _privacyTab() {
    const options = {
      'everyone': 'Everyone',
      'followers': 'Followers',
      'only_me': 'Only me',
    };
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 32),
      children: [
        _card(
          title: 'Privacy',
          subtitle: 'Choose who can follow you and see your activity.',
          children: [
            _fieldLabel('Who can follow me'),
            _picker(
              'Who can follow me',
              _whoCanFollowMe,
              _followOptions,
              (v) => setState(() => _whoCanFollowMe = v),
              labels: options,
            ),
            _fieldLabel('Who can see my activity'),
            _picker(
              'Who can see my activity',
              _whoCanSeeActivity,
              _activityOptions,
              (v) => setState(() => _whoCanSeeActivity = v),
              labels: options,
            ),
            const SizedBox(height: 6),
            _saveButton(
              _savingPrivacy ? 'SAVING…' : 'SAVE PRIVACY',
              _savingPrivacy ? null : _savePrivacy,
            ),
          ],
        ),
      ],
    );
  }

  Widget _fieldLabel(String label) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      label.toUpperCase(),
      style: const TextStyle(
        fontSize: 10,
        letterSpacing: 1.2,
        fontWeight: FontWeight.w600,
        color: AppColors.textGray500,
      ),
    ),
  );

  // ── shared form pieces ─────────────────────────────────────────────────────

  /// A labelled field, matching the web's stacked "LABEL / input / helper"
  /// pattern. [note] is the grey line the web prints under a field ("Date of
  /// birth is locked after it is saved."), and [readOnly] greys the box out for
  /// the values the backend will not accept changes to.
  Widget _field(
    TextEditingController controller,
    String hint, {
    int maxLines = 1,
    String? label,
    String? note,
    bool readOnly = false,
    bool obscure = false,
    int? maxLength,
    String? counter,
    ValueChanged<String>? onChanged,
    String? error,
    String? status,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    label.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray500,
                    ),
                  ),
                ),
                if (counter != null)
                  Text(
                    counter,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: AppColors.textGray600,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
          ],
          TextField(
            controller: controller,
            maxLines: obscure ? 1 : maxLines,
            readOnly: readOnly,
            obscureText: obscure,
            maxLength: maxLength,
            onChanged: (value) {
              if (counter != null) setState(() {});
              onChanged?.call(value);
            },
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: readOnly ? AppColors.textGray400 : Colors.white,
            ),
            decoration: InputDecoration(
              isDense: true,
              counterText: '',
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 13,
              ),
              filled: true,
              fillColor: readOnly
                  ? const Color(0xFF101010)
                  : const Color(0xFF151515),
              hintText: hint,
              hintStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray600,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: const BorderSide(color: AppColors.inputBorder),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: const BorderSide(color: AppColors.inputBorder),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: const BorderSide(color: Color(0x803B82F6)),
              ),
            ),
          ),
          if (note != null) ...[
            const SizedBox(height: 6),
            Text(
              note,
              style: const TextStyle(
                fontSize: 10.5,
                height: 1.4,
                color: AppColors.textGray600,
              ),
            ),
          ],
          if (status != null && error == null) ...[
            const SizedBox(height: 5),
            Text(
              status,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textGray400,
              ),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 5),
            Text(
              error,
              style: const TextStyle(fontSize: 11, color: AppColors.likeRed),
            ),
          ],
        ],
      ),
    );
  }

  /// Tap-to-open field used where the web renders a button instead of an input
  /// (date of birth, country). Locked variants grey out like the web's
  /// `disabled` state.
  Widget _tapField({
    required String label,
    required String value,
    required String placeholder,
    required IconData icon,
    VoidCallback? onTap,
    String? note,
    String? error,
    bool locked = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: locked ? null : onTap,
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                color: locked
                    ? const Color(0xFF101010)
                    : const Color(0xFF151515),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: error == null
                      ? AppColors.inputBorder
                      : AppColors.likeRed.withOpacity(0.6),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      value.isEmpty ? placeholder : value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: value.isEmpty
                            ? AppColors.textGray600
                            : (locked ? AppColors.textGray400 : Colors.white),
                      ),
                    ),
                  ),
                  Icon(
                    icon,
                    size: 15,
                    color: locked
                        ? AppColors.textGray600
                        : AppColors.textGray400,
                  ),
                ],
              ),
            ),
          ),
          if (note != null) ...[
            const SizedBox(height: 6),
            Text(
              note,
              style: const TextStyle(
                fontSize: 10.5,
                height: 1.4,
                color: AppColors.textGray600,
              ),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 5),
            Text(
              error,
              style: const TextStyle(fontSize: 11, color: AppColors.likeRed),
            ),
          ],
        ],
      ),
    );
  }

  Widget _picker(
    String label,
    String value,
    List<String> options,
    ValueChanged<String> onChanged, {
    Map<String, String> labels = const {},
    String? error,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _pickerBox(label, value, options, onChanged, labels),
          if (error != null) ...[
            const SizedBox(height: 5),
            Text(
              error,
              style: const TextStyle(fontSize: 11, color: AppColors.likeRed),
            ),
          ],
        ],
      ),
    );
  }

  Widget _pickerBox(
    String label,
    String value,
    List<String> options,
    ValueChanged<String> onChanged,
    Map<String, String> labels,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF151515),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          isExpanded: true,
          value: options.contains(value) ? value : null,
          hint: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
          dropdownColor: const Color(0xFF151515),
          icon: const Icon(
            Ionicons.chevron_down_outline,
            size: 14,
            color: AppColors.textGray500,
          ),
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
          items: [
            for (final option in options)
              DropdownMenuItem(
                value: option,
                child: Text(labels[option] ?? option),
              ),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }

  Widget _visibilityToggle(
    String label,
    String value,
    ValueChanged<String> onChanged,
  ) {
    final isPublic = value == 'public';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray400,
              ),
            ),
          ),
          GestureDetector(
            onTap: () => onChanged(isPublic ? 'only_me' : 'public'),
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppColors.inputBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isPublic
                        ? Ionicons.eye_outline
                        : Ionicons.lock_closed_outline,
                    size: 12,
                    color: AppColors.textGray300,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isPublic ? 'Public' : 'Only Me',
                    style: const TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textGray300,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _saveButton(String label, VoidCallback? onTap) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          disabledBackgroundColor: Colors.white24,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9999),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _accountCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF141414),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite06),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Tapping the picture itself is the shortcut to changing it —
              // same two sources as the buttons, plus a camera badge so it
              // reads as editable.
              GestureDetector(
                onTap: _changePhotoSheet,
                behavior: HitTestBehavior.opaque,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.bg2,
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: _avatarPreview(),
                    ),
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        width: 20,
                        height: 20,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: const Color(0xFF141414),
                            width: 2,
                          ),
                        ),
                        child: const Icon(
                          Ionicons.camera_outline,
                          size: 11,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Api.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      '@${Api.username}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textGray500,
                      ),
                    ),
                    if (Api.googerId.isNotEmpty)
                      Text(
                        'Googer ID: ${Api.googerId}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.textGray600,
                        ),
                      ),
                    const SizedBox(height: 10),
                    // The web offers both a file upload and a direct image URL.
                    Row(
                      children: [
                        _uploadButton(
                          _pickingPhoto ? 'UPDATING…' : 'UPLOAD PHOTO',
                          filled: true,
                          onTap: _pickingPhoto ? null : _pickProfilePhoto,
                        ),
                        const SizedBox(width: 8),
                        _uploadButton('UPLOAD LINK', onTap: _uploadImageLink),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_hasStagedPhoto) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(
                  Ionicons.image_outline,
                  size: 13,
                  color: AppColors.linkBlue,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'New photo ready. Press SAVE to apply it.',
                    style: TextStyle(fontSize: 11, color: AppColors.linkBlue),
                  ),
                ),
                GestureDetector(
                  onTap: _clearStagedPhoto,
                  behavior: HitTestBehavior.opaque,
                  child: const Padding(
                    padding: EdgeInsets.only(left: 8),
                    child: Text(
                      'REMOVE',
                      style: TextStyle(
                        fontSize: 10,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  bool get _hasStagedPhoto =>
      _pendingPhotoBytes != null || _pendingPhotoLink.isNotEmpty;

  void _changePhotoSheet() => _pickProfilePhoto();

  /// The staged photo wins over the saved avatar, so what the card shows is
  /// always what SAVE will store — the same preview rule the web uses.
  Widget _avatarPreview() {
    const fallback = Icon(
      Ionicons.person_outline,
      size: 20,
      color: AppColors.slateIcon,
    );
    if (_pendingPhotoBytes != null) {
      return Image.memory(_pendingPhotoBytes!, fit: BoxFit.cover);
    }
    final source = _pendingPhotoLink.isNotEmpty
        ? _pendingPhotoLink
        : (Api.avatar ?? '');
    if (source.isEmpty) return fallback;
    return Image.network(
      source,
      key: ValueKey(source),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => fallback,
    );
  }

  /// "Upload Photo" — opens the same picker as the profile page and immediately
  /// posts the selected image as `profile_picture_file`.
  Future<void> _pickProfilePhoto() async {
    setState(() => _pickingPhoto = true);
    try {
      final file = await showProfilePhotoPickerSheet(context);
      if (!mounted) return;
      if (file == null) {
        AppNotifications.info('No photo selected');
        return;
      }
      // 5 MB is the backend's multer ceiling; stop here rather than let the
      // upload fail after the user waited for it.
      if (file.bytes.length > 5 * 1024 * 1024) {
        AppNotifications.error('Please choose an image under 5 MB.');
        return;
      }
      setState(() {
        _pendingPhoto = file;
        _pendingPhotoBytes = file.bytes;
        _pendingPhotoLink = '';
        _savingGeneral = true;
        _generalSaved = false;
      });
      final error = await Api.updateProfile(const {}, profilePhoto: file);
      if (!mounted) return;
      if (error != null) {
        _applyUserToForms();
        AppNotifications.error('Could not update profile picture', error);
        return;
      }
      _pendingPhoto = null;
      _pendingPhotoBytes = null;
      _pendingPhotoLink = '';
      AppNotifications.success('Profile picture updated');
      _applyUserToForms();
      setState(() => _generalSaved = true);
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _generalSaved = false);
      });
    } catch (e) {
      if (mounted) AppNotifications.error('Could not update photo', '$e');
    } finally {
      if (mounted) {
        setState(() {
          _pickingPhoto = false;
          _savingGeneral = false;
        });
      }
    }
  }

  void _clearStagedPhoto() {
    setState(() {
      _pendingPhoto = null;
      _pendingPhotoBytes = null;
      _pendingPhotoLink = '';
    });
  }

  /// Date of birth: a real picker instead of a typed ISO string, capped at
  /// today like the web's `clampDateToToday`.
  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final current = DateTime.tryParse(_dateOfBirth.text.trim());
    final picked = await showDatePicker(
      context: context,
      initialDate: current != null && !current.isAfter(now) ? current : now,
      firstDate: DateTime(1900),
      lastDate: now,
      helpText: 'Select date of birth',
      builder: (context, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(
            primary: Colors.white,
            onPrimary: Colors.black,
            surface: Color(0xFF151515),
            onSurface: Colors.white,
          ),
          dialogTheme: const DialogThemeData(
            backgroundColor: Color(0xFF121216),
          ),
        ),
        child: child ?? const SizedBox.shrink(),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _dateOfBirth.text = _dateString(picked));
  }

  /// Country: the web reads a country list at runtime; the same ISO table is
  /// bundled here, searchable, and stores the plain name the backend keeps.
  Future<void> _pickCountry() async {
    final search = TextEditingController();
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          final query = search.text.trim().toLowerCase();
          final matches = adCountries
              .where(
                (c) => query.isEmpty || c.name.toLowerCase().contains(query),
              )
              .toList();
          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
            ),
            child: SizedBox(
              height: MediaQuery.of(sheetContext).size.height * 0.72,
              child: Column(
                children: [
                  const SizedBox(height: 14),
                  const Text(
                    'Select country',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                    child: TextField(
                      controller: search,
                      autofocus: false,
                      onChanged: (_) => setSheetState(() {}),
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Colors.white,
                      ),
                      decoration: InputDecoration(
                        isDense: true,
                        filled: true,
                        fillColor: const Color(0xFF151515),
                        hintText: 'Search country',
                        hintStyle: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textGray600,
                        ),
                        prefixIcon: const Icon(
                          Ionicons.search_outline,
                          size: 15,
                          color: AppColors.textGray500,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.inputBorder,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.inputBorder,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: matches.length,
                      itemBuilder: (_, i) {
                        final country = matches[i];
                        final isCurrent =
                            country.name.toLowerCase() ==
                            _country.text.trim().toLowerCase();
                        return ListTile(
                          dense: true,
                          onTap: () =>
                              Navigator.pop(sheetContext, country.name),
                          leading: Text(
                            country.flag,
                            style: const TextStyle(fontSize: 17),
                          ),
                          title: Text(
                            country.name,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isCurrent
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                          trailing: isCurrent
                              ? const Icon(
                                  Ionicons.checkmark_outline,
                                  size: 15,
                                  color: Colors.white,
                                )
                              : null,
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    search.dispose();
    if (selected == null || !mounted) return;
    setState(() => _country.text = selected);
  }

  /// The web's "Select Country Code" modal — same search over name, ISO code
  /// and dial code — for the 2FA phone.
  Future<_DialCountry?> _pickDialCountry(_DialCountry current) async {
    final search = TextEditingController();
    final picked = await showModalBottomSheet<_DialCountry>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          final query = search.text.trim().toLowerCase();
          final matches = _dialCountries
              .where(
                (c) =>
                    query.isEmpty ||
                    c.name.toLowerCase().contains(query) ||
                    c.code.toLowerCase().contains(query) ||
                    c.dial.contains(query),
              )
              .toList();
          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
            ),
            child: SizedBox(
              height: MediaQuery.of(sheetContext).size.height * 0.72,
              child: Column(
                children: [
                  const SizedBox(height: 14),
                  const Text(
                    'Select country code',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                    child: TextField(
                      controller: search,
                      onChanged: (_) => setSheetState(() {}),
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Colors.white,
                      ),
                      decoration: InputDecoration(
                        isDense: true,
                        filled: true,
                        fillColor: const Color(0xFF151515),
                        hintText: 'Search country, LK, +94...',
                        hintStyle: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textGray600,
                        ),
                        prefixIcon: const Icon(
                          Ionicons.search_outline,
                          size: 15,
                          color: AppColors.textGray500,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.inputBorder,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.inputBorder,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: matches.length,
                      itemBuilder: (_, i) {
                        final country = matches[i];
                        final isCurrent = country.code == current.code;
                        return ListTile(
                          dense: true,
                          onTap: () => Navigator.pop(sheetContext, country),
                          leading: Text(
                            country.flag,
                            style: const TextStyle(fontSize: 17),
                          ),
                          title: Text(
                            country.name,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isCurrent
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                          trailing: Text(
                            country.dial,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textGray400,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    search.dispose();
    return picked;
  }

  Widget _uploadButton(
    String label, {
    bool filled = false,
    required VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: filled ? Colors.white : Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: filled ? Colors.white : AppColors.borderWhite10,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 9.5,
              letterSpacing: 1,
              fontWeight: FontWeight.w600,
              color: filled ? Colors.black : Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  /// The web's "UPLOAD IMAGE LINK" modal — paste a direct image URL and use it
  /// as the profile picture.
  void _uploadImageLink() {
    final url = TextEditingController();
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.8),
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 20),
        backgroundColor: const Color(0xFF121216),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'UPLOAD IMAGE LINK',
                style: TextStyle(
                  fontSize: 13,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 5),
              const Text(
                'Paste a direct image URL for the profile picture.',
                style: TextStyle(fontSize: 12, color: AppColors.textGray500),
              ),
              const SizedBox(height: 16),
              _field(
                url,
                'https://example.com/profile.jpg',
                label: 'Image URL',
              ),
              Row(
                children: [
                  Expanded(
                    child: _ghostButton(
                      'CANCEL',
                      () => Navigator.maybePop(dialogContext),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _saveButton('USE LINK', () {
                      final value = url.text.trim();
                      if (value.isEmpty) return;
                      // Any public image URL works — a social-media avatar, a
                      // CDN link, or a data: URI — same rule as the web modal.
                      final valid = RegExp(
                        r'^(https?://|data:)',
                        caseSensitive: false,
                      ).hasMatch(value);
                      if (!valid) {
                        AppNotifications.error(
                          'Please enter a valid image URL.',
                        );
                        return;
                      }
                      Navigator.maybePop(dialogContext);
                      setState(() {
                        _pendingPhoto = null;
                        _pendingPhotoBytes = null;
                        _pendingPhotoLink = value;
                        _generalSaved = false;
                      });
                      AppNotifications.info(
                        'Image link added. Press SAVE to apply it.',
                      );
                    }),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  /// The web's two-step protected action, as a sheet: send and verify an OTP
  /// on the current login email, then save the value the action needs.
  ///
  /// `security/verify-otp` hands back a one-shot `securityToken` and every save
  /// endpoint behind it calls `consumeSecurityToken`, so the token — not a
  /// local "verified" flag — is what actually unlocks step 2. Without it the
  /// backend answers "Verified OTP token ... required".
  void _otpGatedSheet({
    required String purpose,
    required String title,
    required String caption,
    required String valueLabel,
    required String submitLabel,
    required Future<String?> Function(String value, String securityToken)
    onSubmit,
    String? confirmLabel,
    bool obscureValue = false,
    Widget Function(StateSetter setSheet, bool unlocked)? stepTwoHeader,
  }) {
    final otp = TextEditingController();
    final value = TextEditingController();
    final confirm = TextEditingController();
    // Once a 2FA phone is on the account the web offers it as a second OTP
    // destination next to the email.
    final u = Api.user ?? const {};
    final phone = '${u['two_factor_phone_number'] ?? ''}'.trim();
    final dialCode = '${u['two_factor_phone_dial_code'] ?? ''}'.trim();
    final canUsePhone = phone.isNotEmpty && dialCode.isNotEmpty;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) {
        var destination = 'email';
        var securityToken = '';
        var busy = false;
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            final verified = securityToken.isNotEmpty;
            return SingleChildScrollView(
              padding: EdgeInsets.only(
                left: 18,
                right: 18,
                top: 18,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 22,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'PROTECTED ACTION',
                    style: TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray600,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    caption,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.45,
                      color: AppColors.textGray500,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Step 1: OTP verification',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: verified ? AppColors.successGreen : Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Email is recommended: ${Api.email}',
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: AppColors.textGray500,
                    ),
                  ),
                  if (canUsePhone) ...[
                    const SizedBox(height: 10),
                    _destinationPills(
                      destination,
                      '$dialCode$phone',
                      (option) => setSheet(() => destination = option),
                    ),
                  ],
                  const SizedBox(height: 10),
                  _field(otp, '6-digit OTP'),
                  Row(
                    children: [
                      Expanded(
                        child: _saveButton('SEND OTP', () async {
                          final (
                            error,
                            debugOtp,
                          ) = await Api.requestAccountSecurityOtp(
                            purpose,
                            destinationType: destination,
                          );
                          if (error != null) {
                            AppNotifications.error('Could not send OTP', error);
                            return;
                          }
                          if (debugOtp != null && debugOtp.isNotEmpty) {
                            otp.text = debugOtp;
                          }
                          AppNotifications.success('OTP sent');
                        }),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _ghostButton(
                          verified ? 'VERIFIED' : 'VERIFY',
                          () async {
                            final (
                              error,
                              token,
                            ) = await Api.verifyAccountSecurityOtp(
                              purpose,
                              otp.text.trim(),
                            );
                            if (error != null) {
                              AppNotifications.error(
                                'Verification failed',
                                error,
                              );
                              return;
                            }
                            setSheet(() => securityToken = token ?? '');
                            AppNotifications.success('OTP verified');
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Step 2: $valueLabel',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: verified ? Colors.white : AppColors.textGray600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (stepTwoHeader != null) stepTwoHeader(setSheet, verified),
                  _field(value, valueLabel, obscure: obscureValue),
                  if (confirmLabel != null)
                    _field(confirm, confirmLabel, obscure: obscureValue),
                  Opacity(
                    opacity: verified && !busy ? 1 : 0.45,
                    child: _saveButton(
                      busy ? 'SAVING…' : submitLabel,
                      verified && !busy
                          ? () async {
                              // The web compares the two boxes before it posts;
                              // the backend never sees the confirmation copy.
                              if (confirmLabel != null &&
                                  value.text != confirm.text) {
                                AppNotifications.error(
                                  'Those two values do not match.',
                                );
                                return;
                              }
                              setSheet(() => busy = true);
                              final error = await onSubmit(
                                value.text,
                                securityToken,
                              );
                              setSheet(() => busy = false);
                              if (error != null) {
                                AppNotifications.error('Could not save', error);
                                return;
                              }
                              if (ctx.mounted) Navigator.maybePop(sheetContext);
                              AppNotifications.success('$title updated');
                              if (mounted) setState(_applyUserToForms);
                            }
                          : null,
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  /// "Send OTP to email / to +94…" chooser, drawn wherever a saved 2FA phone
  /// makes `destinationType: 'phone'` a legal request.
  Widget _destinationPills(
    String selected,
    String phoneLabel,
    ValueChanged<String> onPick,
  ) {
    return Row(
      children: [
        for (final option in const ['email', 'phone'])
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => onPick(option),
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: selected == option ? Colors.white : Colors.transparent,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Text(
                  option == 'email' ? 'Email OTP' : 'Phone OTP ($phoneLabel)',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: selected == option ? Colors.black : Colors.white,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  // â”€â”€ actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /// Reset Password. The web's panel does not ask for the current password at
  /// all — it verifies an OTP (purpose `reset_password`) and posts the new
  /// password to `security/reset-password`, which is a different endpoint from
  /// `/auth/change-password` and the one the row's copy describes.
  void _resetPassword() {
    _otpGatedSheet(
      purpose: 'reset_password',
      title: 'Reset Password',
      caption: 'Verify current email OTP before creating a new password.',
      valueLabel: 'New password',
      confirmLabel: 'Confirm new password',
      obscureValue: true,
      submitLabel: 'RESET PASSWORD',
      onSubmit: (value, securityToken) =>
          Api.resetPasswordWithSecurityOtp(value, securityToken),
    );
  }

  Future<void> _logout() async {
    final ok = await _confirm('Log out of Googer on this device?');
    if (ok != true) return;
    Api.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _deactivate() => _dangerActionSheet(
    purpose: 'self_deactivate',
    title: 'Deactivate account',
    caption:
        'Your profile is hidden until you log in again. Verify an OTP to '
        'continue.',
    confirmLabel: 'DEACTIVATE ACCOUNT',
    accent: const Color(0xFFEAB308),
    run: Api.selfDeactivate,
  );

  void _deleteAccount() => _dangerActionSheet(
    purpose: 'self_delete',
    title: 'Delete account',
    caption:
        'This permanently removes your Googer account and cannot be '
        'undone. Verify an OTP to continue.',
    confirmLabel: 'DELETE ACCOUNT',
    accent: AppColors.likeRed,
    run: Api.selfDelete,
  );

  /// The web gates deactivate/delete behind `security/request-otp` +
  /// `security/verify-otp` before it calls the action, with the same
  /// email-or-phone destination choice. This is that flow as a sheet.
  void _dangerActionSheet({
    required String purpose,
    required String title,
    required String caption,
    required String confirmLabel,
    required Color accent,
    required Future<String?> Function() run,
  }) {
    final otp = TextEditingController();
    final phone = '${(Api.user ?? const {})['two_factor_phone_number'] ?? ''}'
        .trim();
    final dialCode =
        '${(Api.user ?? const {})['two_factor_phone_dial_code'] ?? ''}'.trim();
    final canUsePhone = phone.isNotEmpty && dialCode.isNotEmpty;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) {
        var destination = 'email';
        var verified = false;
        var busy = false;
        var status = '';
        return StatefulBuilder(
          builder: (ctx, setSheet) => Padding(
            padding: EdgeInsets.only(
              left: 18,
              right: 18,
              top: 18,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 22,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'PROTECTED ACTION',
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  caption,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.45,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 16),
                if (canUsePhone)
                  Row(
                    children: [
                      for (final option in const ['email', 'phone'])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => setSheet(() => destination = option),
                            behavior: HitTestBehavior.opaque,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: destination == option
                                    ? Colors.white
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: AppColors.borderWhite10,
                                ),
                              ),
                              child: Text(
                                option == 'email'
                                    ? 'Email OTP'
                                    : 'Phone OTP ($dialCode)',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                  color: destination == option
                                      ? Colors.black
                                      : Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                if (canUsePhone) const SizedBox(height: 12),
                Text(
                  destination == 'phone'
                      ? 'OTP goes to $dialCode$phone'
                      : 'OTP goes to ${Api.email}',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 10),
                _field(otp, '6-digit OTP'),
                if (status.isNotEmpty) ...[
                  Text(
                    status,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: verified
                          ? AppColors.successGreen
                          : AppColors.textGray400,
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                Row(
                  children: [
                    Expanded(
                      child: _saveButton('SEND OTP', () async {
                        final (
                          error,
                          debugOtp,
                        ) = await Api.requestAccountSecurityOtp(
                          purpose,
                          destinationType: destination,
                        );
                        if (error != null) {
                          AppNotifications.error('Could not send OTP', error);
                          return;
                        }
                        if (debugOtp != null && debugOtp.isNotEmpty) {
                          otp.text = debugOtp;
                        }
                        setSheet(() => status = 'OTP sent. Enter it above.');
                        AppNotifications.success('OTP sent');
                      }),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _ghostButton(
                        verified ? 'VERIFIED' : 'VERIFY',
                        () async {
                          // `self_deactivate` / `self_delete` ignore the token
                          // server-side, so only the error half is read here.
                          final (error, _) = await Api.verifyAccountSecurityOtp(
                            purpose,
                            otp.text.trim(),
                          );
                          if (error != null) {
                            AppNotifications.error(
                              'Verification failed',
                              error,
                            );
                            return;
                          }
                          setSheet(() {
                            verified = true;
                            status = 'OTP verified. Continue below.';
                          });
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Opacity(
                  opacity: verified && !busy ? 1 : 0.45,
                  child: GestureDetector(
                    onTap: verified && !busy
                        ? () async {
                            setSheet(() => busy = true);
                            final error = await run();
                            if (error != null) {
                              setSheet(() => busy = false);
                              AppNotifications.error(
                                'Could not complete that action',
                                error,
                              );
                              return;
                            }
                            Api.logout();
                            if (!mounted) return;
                            Navigator.pushAndRemoveUntil(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const LoginScreen(),
                              ),
                              (route) => false,
                            );
                          }
                        : null,
                    child: Container(
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: accent.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: accent.withOpacity(0.45)),
                      ),
                      child: Text(
                        busy ? 'WORKING…' : confirmLabel,
                        style: TextStyle(
                          fontSize: 12,
                          letterSpacing: 1.6,
                          fontWeight: FontWeight.w700,
                          color: accent,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _ghostButton('CANCEL', () => Navigator.maybePop(sheetContext)),
              ],
            ),
          ),
        );
      },
    );
  }

  // â”€â”€ shared sheet helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Future<bool?> _confirm(String message) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          'Confirm',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        content: Text(
          message,
          style: const TextStyle(fontSize: 13, color: AppColors.textGray300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: AppColors.textGray400),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(
              'Confirm',
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
  }
}

/* ── 2FA dial codes ───────────────────────────────────────────────────────── */

/// One row of the web's "Select Country Code" modal.
///
/// The web fills that modal from its own `/country-codes` route, which is a
/// Next.js handler on the web host and not part of the Express API this app
/// talks to — so the dial codes are embedded here, exactly as
/// `ad_countries.dart` embeds the country list for the same reason. The names
/// still come from `adCountries`, so there is one spelling of each country in
/// the app.
class _DialCountry {
  final String code;
  final String name;
  final String dial;
  const _DialCountry(this.code, this.name, this.dial);

  String get flag {
    if (code.length != 2) return '';
    const base = 0x1F1E6;
    final upper = code.toUpperCase();
    return String.fromCharCodes([
      base + upper.codeUnitAt(0) - 0x41,
      base + upper.codeUnitAt(1) - 0x41,
    ]);
  }
}

const Map<String, String> _dialCodes = {
  'AF': '+93',
  'AL': '+355',
  'DZ': '+213',
  'AD': '+376',
  'AO': '+244',
  'AG': '+1268',
  'AR': '+54',
  'AM': '+374',
  'AU': '+61',
  'AT': '+43',
  'AZ': '+994',
  'BS': '+1242',
  'BH': '+973',
  'BD': '+880',
  'BB': '+1246',
  'BY': '+375',
  'BE': '+32',
  'BZ': '+501',
  'BJ': '+229',
  'BT': '+975',
  'BO': '+591',
  'BA': '+387',
  'BW': '+267',
  'BR': '+55',
  'BN': '+673',
  'BG': '+359',
  'BF': '+226',
  'BI': '+257',
  'KH': '+855',
  'CM': '+237',
  'CA': '+1',
  'CV': '+238',
  'CF': '+236',
  'TD': '+235',
  'CL': '+56',
  'CN': '+86',
  'CO': '+57',
  'KM': '+269',
  'CG': '+242',
  'CD': '+243',
  'CR': '+506',
  'CI': '+225',
  'HR': '+385',
  'CU': '+53',
  'CY': '+357',
  'CZ': '+420',
  'DK': '+45',
  'DJ': '+253',
  'DM': '+1767',
  'DO': '+1809',
  'EC': '+593',
  'EG': '+20',
  'SV': '+503',
  'GQ': '+240',
  'ER': '+291',
  'EE': '+372',
  'SZ': '+268',
  'ET': '+251',
  'FJ': '+679',
  'FI': '+358',
  'FR': '+33',
  'GA': '+241',
  'GM': '+220',
  'GE': '+995',
  'DE': '+49',
  'GH': '+233',
  'GR': '+30',
  'GD': '+1473',
  'GT': '+502',
  'GN': '+224',
  'GW': '+245',
  'GY': '+592',
  'HT': '+509',
  'HN': '+504',
  'HK': '+852',
  'HU': '+36',
  'IS': '+354',
  'IN': '+91',
  'ID': '+62',
  'IR': '+98',
  'IQ': '+964',
  'IE': '+353',
  'IL': '+972',
  'IT': '+39',
  'JM': '+1876',
  'JP': '+81',
  'JO': '+962',
  'KZ': '+7',
  'KE': '+254',
  'KI': '+686',
  'KW': '+965',
  'KG': '+996',
  'LA': '+856',
  'LV': '+371',
  'LB': '+961',
  'LS': '+266',
  'LR': '+231',
  'LY': '+218',
  'LI': '+423',
  'LT': '+370',
  'LU': '+352',
  'MO': '+853',
  'MG': '+261',
  'MW': '+265',
  'MY': '+60',
  'MV': '+960',
  'ML': '+223',
  'MT': '+356',
  'MH': '+692',
  'MR': '+222',
  'MU': '+230',
  'MX': '+52',
  'FM': '+691',
  'MD': '+373',
  'MC': '+377',
  'MN': '+976',
  'ME': '+382',
  'MA': '+212',
  'MZ': '+258',
  'MM': '+95',
  'NA': '+264',
  'NR': '+674',
  'NP': '+977',
  'NL': '+31',
  'NZ': '+64',
  'NI': '+505',
  'NE': '+227',
  'NG': '+234',
  'KP': '+850',
  'MK': '+389',
  'NO': '+47',
  'OM': '+968',
  'PK': '+92',
  'PW': '+680',
  'PS': '+970',
  'PA': '+507',
  'PG': '+675',
  'PY': '+595',
  'PE': '+51',
  'PH': '+63',
  'PL': '+48',
  'PT': '+351',
  'PR': '+1787',
  'QA': '+974',
  'RO': '+40',
  'RU': '+7',
  'RW': '+250',
  'KN': '+1869',
  'LC': '+1758',
  'VC': '+1784',
  'WS': '+685',
  'SM': '+378',
  'ST': '+239',
  'SA': '+966',
  'SN': '+221',
  'RS': '+381',
  'SC': '+248',
  'SL': '+232',
  'SG': '+65',
  'SK': '+421',
  'SI': '+386',
  'SB': '+677',
  'SO': '+252',
  'ZA': '+27',
  'KR': '+82',
  'SS': '+211',
  'ES': '+34',
  'LK': '+94',
  'SD': '+249',
  'SR': '+597',
  'SE': '+46',
  'CH': '+41',
  'SY': '+963',
  'TW': '+886',
  'TJ': '+992',
  'TZ': '+255',
  'TH': '+66',
  'TL': '+670',
  'TG': '+228',
  'TO': '+676',
  'TT': '+1868',
  'TN': '+216',
  'TR': '+90',
  'TM': '+993',
  'TV': '+688',
  'UG': '+256',
  'UA': '+380',
  'AE': '+971',
  'GB': '+44',
  'US': '+1',
  'UY': '+598',
  'UZ': '+998',
  'VU': '+678',
  'VA': '+39',
  'VE': '+58',
  'VN': '+84',
  'YE': '+967',
  'ZM': '+260',
  'ZW': '+263',
};

/// Alphabetical, the order the web's modal presents after its own sort.
final List<_DialCountry> _dialCountries = [
  for (final country in adCountries)
    if (_dialCodes.containsKey(country.code))
      _DialCountry(country.code, country.name, _dialCodes[country.code]!),
];

/// Falls back to Sri Lanka, the same default the web's picker opens on.
_DialCountry _dialCountryFor(String code) {
  final wanted = code.trim().toUpperCase();
  return _dialCountries.firstWhere(
    (c) => c.code == wanted,
    orElse: () => _dialCountries.firstWhere(
      (c) => c.code == 'LK',
      orElse: () => _dialCountries.first,
    ),
  );
}

/* ── Security sub-pages ───────────────────────────────────────────────────── */

/// Shared chrome for Security destinations. The app bar is the only page title;
/// the inner content starts directly with the action controls.
class _SecuritySubPage extends StatelessWidget {
  final String title;
  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  const _SecuritySubPage({
    required this.title,
    required this.children,
    this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final list = ListView(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 32),
      children: children,
    );
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
      ),
      body: onRefresh == null
          ? list
          : RefreshIndicator(
              color: AppColors.textGray300,
              backgroundColor: AppColors.bg1,
              onRefresh: onRefresh!,
              child: list,
            ),
    );
  }
}

/// Panel used by the sub-pages, same shape as the settings tabs' cards.
class _SubCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final List<Widget> children;

  const _SubCard({
    required this.title,
    this.subtitle,
    this.trailing,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (title.isNotEmpty || subtitle != null)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (title.isNotEmpty)
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          subtitle!,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.45,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ],
                  ),
                )
              else
                const Spacer(),
              if (trailing != null) trailing!,
            ],
          ),
          if (title.isNotEmpty || subtitle != null || trailing != null)
            const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }
}

Widget _pillAction(String label, VoidCallback? onTap, {bool filled = true}) {
  return GestureDetector(
    onTap: onTap,
    child: Opacity(
      opacity: onTap == null ? 0.45 : 1,
      child: Container(
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? Colors.white : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: filled ? Colors.white : AppColors.borderWhite10,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11.5,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w700,
            color: filled ? Colors.black : Colors.white,
          ),
        ),
      ),
    ),
  );
}

Widget _plainField(
  TextEditingController controller,
  String hint, {
  bool obscure = false,
}) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: controller,
      obscureText: obscure,
      style: const TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
      decoration: InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        filled: true,
        fillColor: const Color(0xFF151515),
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray600,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.inputBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.inputBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0x803B82F6)),
        ),
      ),
    ),
  );
}

/* ── Change Login Email ───────────────────────────────────────────────────── */

class ChangeLoginEmailScreen extends StatefulWidget {
  const ChangeLoginEmailScreen({super.key});

  @override
  State<ChangeLoginEmailScreen> createState() => _ChangeLoginEmailScreenState();
}

class _ChangeLoginEmailScreenState extends State<ChangeLoginEmailScreen> {
  final _otp = TextEditingController();
  final _newEmail = TextEditingController();

  /// One-shot token from `security/verify-otp`; `security/change-email`
  /// consumes it and rejects the save without it.
  String _securityToken = '';
  bool _busy = false;

  bool get _verified => _securityToken.isNotEmpty;

  @override
  void dispose() {
    _otp.dispose();
    _newEmail.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    if (_busy) return;
    setState(() => _busy = true);
    final (error, debugOtp) = await Api.requestAccountSecurityOtp(
      'change_email',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      AppNotifications.error('Could not send OTP', error);
      return;
    }
    // Dev builds echo the code back so the flow is testable without a mailbox.
    if (debugOtp != null && debugOtp.isNotEmpty) _otp.text = debugOtp;
    AppNotifications.success('OTP sent to ${Api.email}');
    setState(() {});
  }

  Future<void> _verify() async {
    if (_busy) return;
    setState(() => _busy = true);
    final (error, token) = await Api.verifyAccountSecurityOtp(
      'change_email',
      _otp.text.trim(),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      AppNotifications.error('Verification failed', error);
      return;
    }
    setState(() => _securityToken = token ?? '');
    AppNotifications.success('OTP verified');
  }

  Future<void> _save() async {
    if (!_verified) {
      AppNotifications.error('Verify OTP first.');
      return;
    }
    final value = _newEmail.text.trim();
    if (value.isEmpty) {
      AppNotifications.error('New login email is required.');
      return;
    }
    setState(() => _busy = true);
    final error = await Api.changeLoginEmailWithOtp(value, _securityToken);
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      AppNotifications.error('Could not save email', error);
      return;
    }
    AppNotifications.success('Login email updated');
    Navigator.maybePop(context);
  }

  @override
  Widget build(BuildContext context) {
    return _SecuritySubPage(
      title: 'Change Login Email',
      children: [
        _SubCard(
          title: '',
          children: [
            const Text(
              'PROTECTED ACTION',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray600,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Step 1: OTP verification',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: _verified ? AppColors.successGreen : Colors.white,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Email is recommended: ${Api.email}',
              style: const TextStyle(
                fontSize: 11.5,
                color: AppColors.textGray500,
                decoration: TextDecoration.underline,
                decorationColor: AppColors.textGray600,
              ),
            ),
            const SizedBox(height: 12),
            _plainField(_otp, '6-digit OTP'),
            Row(
              children: [
                Expanded(child: _pillAction('SEND OTP', _sendOtp)),
                const SizedBox(width: 12),
                Expanded(
                  child: _pillAction(
                    _verified ? 'VERIFIED' : 'VERIFY',
                    _verified || _busy ? null : _verify,
                    filled: false,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              'Step 2: New login email',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: _verified ? Colors.white : AppColors.textGray600,
              ),
            ),
            const SizedBox(height: 12),
            _plainField(_newEmail, 'New login email'),
            _pillAction(
              _busy ? 'SAVING…' : 'SAVE EMAIL',
              _verified && !_busy ? _save : null,
            ),
          ],
        ),
      ],
    );
  }
}

/* ── Security Alerts (login history) ──────────────────────────────────────── */

class SecurityAlertsScreen extends StatefulWidget {
  const SecurityAlertsScreen({super.key});

  @override
  State<SecurityAlertsScreen> createState() => _SecurityAlertsScreenState();
}

class _SecurityAlertsScreenState extends State<SecurityAlertsScreen> {
  static const _perPage = 5;

  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    final rows = await Api.authSessionHistory();
    if (!mounted) return;
    setState(() {
      _rows = rows;
      _loading = false;
      // Keep the viewer on a page that still exists after a refresh.
      if (_page > _lastPage) _page = _lastPage;
    });
  }

  int get _lastPage => _rows.isEmpty ? 0 : ((_rows.length - 1) ~/ _perPage);

  List<Map<String, dynamic>> get _visible =>
      _rows.skip(_page * _perPage).take(_perPage).toList();

  static String _str(Map row, List<String> keys, [String fallback = '']) {
    for (final key in keys) {
      final value = '${row[key] ?? ''}'.trim();
      if (value.isNotEmpty && value != 'null') return value;
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    return _SecuritySubPage(
      title: 'Security Alerts',
      onRefresh: _load,
      children: [
        _pillAction('REFRESH', _load),
        const SizedBox(height: 16),
        _SubCard(
          title: '',
          subtitle: 'Recent account sign-ins and session outcomes.',
          trailing: Text(
            'PAGE ${_page + 1} / ${_lastPage + 1}',
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
          children: [
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 30),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: AppColors.textGray400,
                      strokeWidth: 2,
                    ),
                  ),
                ),
              )
            else if (_rows.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 26),
                child: Text(
                  'No sign-ins recorded yet.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: AppColors.textGray500,
                  ),
                ),
              )
            else ...[
              for (final row in _visible) _historyRow(row),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  SizedBox(
                    width: 130,
                    child: _pillAction(
                      'PREVIOUS',
                      _page == 0 ? null : () => setState(() => _page -= 1),
                      filled: false,
                    ),
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 110,
                    child: _pillAction(
                      'NEXT',
                      _page >= _lastPage
                          ? null
                          : () => setState(() => _page += 1),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _historyRow(Map<String, dynamic> row) {
    // `mapAuthSession` emits camelCase only, and the web shows the most
    // specific outcome it has: loginResult, then approvalStatus, then status.
    final status = _str(row, [
      'loginResult',
      'approvalStatus',
      'status',
    ], 'success').toLowerCase();
    final denied = status == 'denied';
    final pending = status == 'pending';
    // Same city/region/country fallback the web uses when there is no IP.
    final location = [
      _str(row, ['city']),
      _str(row, ['region']),
      _str(row, ['country']),
    ].where((p) => p.isNotEmpty).join(', ');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            Api.postedDate(_str(row, ['loginAt', 'lastActiveAt'])),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _str(row, ['deviceName'], 'Unknown Device'),
            style: const TextStyle(fontSize: 12, color: AppColors.textGray400),
          ),
          const SizedBox(height: 2),
          Text(
            _str(row, ['ipAddress'], location.isEmpty ? '—' : location),
            style: const TextStyle(
              fontSize: 11.5,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            status,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: denied
                  ? AppColors.likeRed
                  : pending
                  ? const Color(0xFFEAB308)
                  : AppColors.successGreen,
            ),
          ),
        ],
      ),
    );
  }
}

/* ── Trusted Devices ──────────────────────────────────────────────────────── */

class TrustedDevicesScreen extends StatefulWidget {
  const TrustedDevicesScreen({super.key});

  @override
  State<TrustedDevicesScreen> createState() => _TrustedDevicesScreenState();
}

class _TrustedDevicesScreenState extends State<TrustedDevicesScreen> {
  static const _perPage = 5;

  List<Map<String, dynamic>> _sessions = const [];
  bool _loading = true;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    final rows = await Api.authSessions();
    if (!mounted) return;
    setState(() {
      _sessions = rows;
      _loading = false;
      if (_page > _lastPage) _page = _lastPage;
    });
  }

  /// A new sign-in the backend is holding at `approval_status = 'pending'`.
  /// The web raises these above the list as a "Security Alert" the owner has
  /// to answer before the device may continue.
  List<Map<String, dynamic>> get _pending =>
      _sessions.where((s) => _str(s, ['approvalStatus']) == 'pending').toList();

  /// The web's `activeDevices`: current device or a live non-pending session,
  /// current first then most recently active, de-duplicated on the same key it
  /// uses so one physical device is not listed once per session row.
  List<Map<String, dynamic>> get _active {
    final rows =
        _sessions
            .where(
              (s) =>
                  _bool(s, ['isCurrent']) ||
                  (_str(s, ['status']) == 'active' &&
                      _str(s, ['approvalStatus']) != 'pending'),
            )
            .toList()
          ..sort((a, b) {
            final aCurrent = _bool(a, ['isCurrent']);
            final bCurrent = _bool(b, ['isCurrent']);
            if (aCurrent != bCurrent) return aCurrent ? -1 : 1;
            final aAt = DateTime.tryParse(_str(a, ['lastActiveAt', 'loginAt']));
            final bAt = DateTime.tryParse(_str(b, ['lastActiveAt', 'loginAt']));
            if (aAt == null || bAt == null) return 0;
            return bAt.compareTo(aAt);
          });
    final seen = <String>{};
    final unique = <Map<String, dynamic>>[];
    for (final row in rows) {
      final key = [
        _bool(row, ['isCurrent']) ? 'current' : 'device',
        _str(row, ['browser']),
        _str(row, ['operatingSystem']),
        _str(row, ['deviceType']),
        _str(row, ['ipAddress']),
      ].join('|').toLowerCase();
      if (seen.add(key)) unique.add(row);
    }
    return unique;
  }

  int get _lastPage => _active.isEmpty ? 0 : ((_active.length - 1) ~/ _perPage);

  List<Map<String, dynamic>> get _visible =>
      _active.skip(_page * _perPage).take(_perPage).toList();

  static String _str(Map row, List<String> keys, [String fallback = '']) {
    for (final key in keys) {
      final value = '${row[key] ?? ''}'.trim();
      if (value.isNotEmpty && value != 'null') return value;
    }
    return fallback;
  }

  static bool _bool(Map row, List<String> keys) {
    for (final key in keys) {
      if (row[key] == true) return true;
    }
    return false;
  }

  Future<void> _setTrusted(Map<String, dynamic> session, bool trusted) async {
    final id = _str(session, ['id']);
    if (id.isEmpty) return;
    final ok = await Api.updateAuthSession(id, trusted: trusted);
    if (!mounted) return;
    ok
        ? AppNotifications.success(
            trusted ? 'Device trusted' : 'Device untrusted',
          )
        : AppNotifications.error('Could not update this device');
    if (ok) _load();
  }

  /// PATCH with `trusted: true/false` is also how a pending device is approved
  /// or denied — the backend flips `approval_status` off the same flag.
  Future<void> _resolvePending(
    Map<String, dynamic> session,
    bool approve,
  ) async {
    final id = _str(session, ['id']);
    if (id.isEmpty) return;
    final ok = await Api.updateAuthSession(id, trusted: approve);
    if (!mounted) return;
    ok
        ? AppNotifications.success(
            approve
                ? 'Device trusted. Login can continue.'
                : 'Device request denied.',
          )
        : AppNotifications.error(
            approve ? 'Could not trust device' : 'Could not deny device',
          );
    if (ok) _load();
  }

  Future<void> _remove(Map<String, dynamic> session) async {
    final id = _str(session, ['id']);
    if (id.isEmpty) return;
    final ok = await Api.removeSession(id);
    if (!mounted) return;
    ok
        ? AppNotifications.success('Device removed')
        : AppNotifications.error('Could not remove this device');
    if (ok) _load();
  }

  Future<void> _logoutOthers() async {
    final ok = await Api.logoutOtherSessions();
    if (!mounted) return;
    ok
        ? AppNotifications.success('Signed out of other devices')
        : AppNotifications.error('Could not sign out other devices');
    if (ok) _load();
  }

  void _showDetails(Map<String, dynamic> session) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'DEVICE DETAILS',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 1.8,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 14),
              for (final entry in session.entries)
                if ('${entry.value}'.trim().isNotEmpty &&
                    '${entry.value}' != 'null')
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 130,
                          child: Text(
                            entry.key,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textGray600,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Text(
                            '${entry.value}',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return _SecuritySubPage(
      title: 'Trusted Devices',
      onRefresh: _load,
      children: [
        _pillAction('REFRESH', _load),
        const SizedBox(height: 16),
        for (final session in _pending) _pendingApprovalCard(session),
        _SubCard(
          title: '',
          trailing: _active.length > _perPage
              ? Text(
                  'PAGE ${_page + 1} / ${_lastPage + 1}',
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray600,
                  ),
                )
              : null,
          children: [
            _pillAction('LOG OUT OTHERS', _logoutOthers),
            const SizedBox(height: 14),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 30),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: AppColors.textGray400,
                      strokeWidth: 2,
                    ),
                  ),
                ),
              )
            else if (_active.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 26),
                child: Text(
                  'No logged devices found yet.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: AppColors.textGray500,
                  ),
                ),
              )
            else ...[
              for (final session in _visible) _deviceRow(session),
              // The web only draws the pager once the list outgrows one page.
              if (_active.length > _perPage)
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    SizedBox(
                      width: 130,
                      child: _pillAction(
                        'PREVIOUS',
                        _page == 0 ? null : () => setState(() => _page -= 1),
                        filled: false,
                      ),
                    ),
                    const SizedBox(width: 12),
                    SizedBox(
                      width: 110,
                      child: _pillAction(
                        'NEXT',
                        _page >= _lastPage
                            ? null
                            : () => setState(() => _page += 1),
                      ),
                    ),
                  ],
                ),
            ],
          ],
        ),
      ],
    );
  }

  /// The web's amber "Security Alert" block for a device awaiting approval.
  Widget _pendingApprovalCard(Map<String, dynamic> session) {
    const amber = Color(0xFFEAB308);
    final location = [
      _str(session, ['city']),
      _str(session, ['region']),
      _str(session, ['country']),
    ].where((p) => p.isNotEmpty).join(', ');
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: amber.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: amber.withOpacity(0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SECURITY ALERT',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w700,
              color: amber,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'A new device is trying to access your account.',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Approve the request only when you recognize the device and '
            'location.',
            style: TextStyle(
              fontSize: 12,
              height: 1.45,
              color: AppColors.textGray400,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${_str(session, ['deviceName'], 'Unknown device')} | '
            '${location.isEmpty ? 'an unknown location' : location} | '
            'Login time ${Api.postedDate(_str(session, ['loginAt']))}',
            style: const TextStyle(
              fontSize: 11.5,
              height: 1.4,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _pillAction(
                  'TRUST DEVICE',
                  () => _resolvePending(session, true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _outlineAction(
                  "DON'T TRUST",
                  AppColors.likeRed,
                  () => _resolvePending(session, false),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _deviceRow(Map<String, dynamic> session) {
    final current = _bool(session, ['isCurrent']);
    final trusted = _bool(session, ['trusted']);
    final name = current
        ? 'Current Device'
        : _str(session, ['deviceName'], 'Unknown device');
    // `mapAuthSession` sends `deviceType`, and the web picks the phone icon
    // only for an exact "Mobile".
    final deviceType = _str(session, ['deviceType'], 'Unknown');
    final desktop = deviceType != 'Mobile';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Icon(
                  desktop
                      ? Ionicons.desktop_outline
                      : Ionicons.phone_portrait_outline,
                  size: 17,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        if (trusted) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.successGreen.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: AppColors.successGreen.withOpacity(0.4),
                              ),
                            ),
                            child: const Text(
                              'TRUSTED',
                              style: TextStyle(
                                fontSize: 9,
                                letterSpacing: 1.2,
                                fontWeight: FontWeight.w700,
                                color: AppColors.successGreen,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${_str(session, ['browser'], 'Unknown')} on '
                      '${_str(session, ['operatingSystem'], 'Unknown')} | '
                      '$deviceType',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textGray500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Last active '
                      '${Api.postedDate(_str(session, ['lastActiveAt', 'loginAt']))}',
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.textGray600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              GestureDetector(
                onTap: () => _showDetails(session),
                child: Container(
                  width: 46,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: const Icon(
                    Ionicons.eye_outline,
                    size: 16,
                    color: AppColors.textGray300,
                  ),
                ),
              ),
              // The web offers neither control for the session you are on —
              // untrusting or removing it would sign you out mid-page.
              if (!current) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: _outlineAction(
                    trusted ? 'UNTRUST' : 'TRUST',
                    const Color(0xFF3B82F6),
                    () => _setTrusted(session, !trusted),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _outlineAction(
                    'REMOVE',
                    AppColors.likeRed,
                    () => _remove(session),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _outlineAction(String label, Color color, VoidCallback? onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: onTap == null ? 0.4 : 1,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: color.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withOpacity(0.45)),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ),
      ),
    );
  }
}
