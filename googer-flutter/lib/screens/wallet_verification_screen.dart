import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/ad_countries.dart';
import '../util/upload_picker.dart';
import '../widgets/app_back_button.dart';

const _amber = Color(0xFFFBBF24);
const _amberBorder = Color(0x33FBBF24);
const _amberFill = Color(0x14FBBF24);
const _greenBorder = Color(0x4D22C55E);
const _greenFill = Color(0x1A22C55E);
const _redBorder = Color(0x4DEF4444);
const _redFill = Color(0x14EF4444);
const _fieldFill = Color(0xFF030303);
const _webBorder = Color(0xB31F2937);

String _cleanKycText(String value) {
  return value
      .replaceAll('Â·', '-')
      .replaceAll('â€”', '-')
      .replaceAll('â€¦', '...')
      .replaceAll('…', '...')
      .replaceAll('—', '-');
}

enum _KycState { none, pending, approved, rejected }

class WalletVerificationScreen extends StatefulWidget {
  const WalletVerificationScreen({super.key});

  @override
  State<WalletVerificationScreen> createState() =>
      _WalletVerificationScreenState();
}

class _WalletVerificationScreenState extends State<WalletVerificationScreen> {
  static const _documentTypes = ['NIC', 'Passport', 'Driving License'];
  static const _steps = [
    'Personal Info',
    'Identity',
    'Authenticity',
    'Business',
  ];

  bool _loading = true;
  bool _submitting = false;
  bool _showForm = false;
  int _step = 0;
  Map<String, dynamic> _record = const {};
  String _documentType = _documentTypes.first;
  List<AdCountry> _countryCatalog = adCountries;

  final _fullName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _dateOfBirth = TextEditingController();
  final _country = TextEditingController();
  final _officialWebsite = TextEditingController();
  final _socialLinks = TextEditingController();
  final _newsLinks = TextEditingController();
  final _vatNumber = TextEditingController();
  final _businessWebsite = TextEditingController();

  ApiUploadFile? _docFront;
  ApiUploadFile? _docBack;
  ApiUploadFile? _brandProof;
  ApiUploadFile? _businessReg;
  ApiUploadFile? _companyDocs;

  bool get _requiresBackImage => _documentType != 'Passport';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _phone.dispose();
    _address.dispose();
    _dateOfBirth.dispose();
    _country.dispose();
    _officialWebsite.dispose();
    _socialLinks.dispose();
    _newsLinks.dispose();
    _vatNumber.dispose();
    _businessWebsite.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    if (!Api.loggedIn) {
      if (!mounted) return;
      setState(() {
        _record = const {};
        _countryCatalog = adCountries;
        _loading = false;
        _showForm = true;
      });
      return;
    }
    final results = await Future.wait([
      Api.verificationStatus(),
      Api.countryCatalog(),
    ]);
    final data = results[0] as Map<String, dynamic>;
    if (!mounted) return;
    final nested = data['verification'];
    final record = nested is Map
        ? Map<String, dynamic>.from(nested)
        : Map<String, dynamic>.from(data);
    setState(() {
      _record = record;
      _countryCatalog = adCountriesFromApiRows(results[1] as List<dynamic>);
      _loading = false;
      _showForm = _state == _KycState.none;
      if (_fullName.text.isEmpty) {
        _fullName.text =
            '${record['full_name'] ?? (Api.loggedIn ? Api.displayName : '')}'
                .trim();
      }
      if (_email.text.isEmpty) {
        _email.text = '${record['email'] ?? (Api.loggedIn ? Api.email : '')}'
            .trim();
      }
      if (_phone.text.isEmpty) _phone.text = '${record['phone'] ?? ''}'.trim();
      if (_address.text.isEmpty) {
        _address.text = '${record['address'] ?? ''}'.trim();
      }
      if (_dateOfBirth.text.isEmpty) {
        _dateOfBirth.text = '${record['date_of_birth'] ?? ''}'.trim();
      }
      if (_country.text.isEmpty) {
        _country.text = '${record['country'] ?? ''}'.trim();
      }
      if (_officialWebsite.text.isEmpty) {
        _officialWebsite.text = '${record['official_website'] ?? ''}'.trim();
      }
      if (_socialLinks.text.isEmpty) {
        _socialLinks.text = '${record['social_links'] ?? ''}'.trim();
      }
      if (_newsLinks.text.isEmpty) {
        _newsLinks.text = '${record['news_links'] ?? ''}'.trim();
      }
      if (_vatNumber.text.isEmpty) {
        _vatNumber.text = '${record['vat_number'] ?? ''}'.trim();
      }
      if (_businessWebsite.text.isEmpty) {
        _businessWebsite.text = '${record['business_website'] ?? ''}'.trim();
      }
      final type = '${record['document_type'] ?? ''}'.trim();
      if (_documentTypes.contains(type)) _documentType = type;
    });
  }

  _KycState get _state {
    final raw = '${_record['status'] ?? _record['verification_status'] ?? ''}'
        .toLowerCase()
        .trim();
    switch (raw) {
      case 'verified':
      case 'approved':
        return _KycState.approved;
      case 'under review':
      case 'pending':
      case 'submitted':
        return _KycState.pending;
      case 'rejected':
      case 'declined':
        return _KycState.rejected;
      default:
        return _KycState.none;
    }
  }

  Future<void> _pickSingleUpload({
    required String field,
    required ValueChanged<ApiUploadFile?> onPicked,
  }) async {
    final picked = await pickUploadFiles(
      field: field,
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
    );
    if (!mounted || picked.isEmpty) return;
    setState(() => onPicked(picked.first));
  }

  Future<void> _submit() async {
    final name = _fullName.text.trim();
    final email = _email.text.trim();
    if (name.isEmpty) {
      AppNotifications.error('Enter your legal full name');
      return;
    }
    if (!email.contains('@')) {
      AppNotifications.error('Enter a valid email address');
      return;
    }
    if (_address.text.trim().isEmpty ||
        _dateOfBirth.text.trim().isEmpty ||
        _country.text.trim().isEmpty) {
      AppNotifications.error('Fill in all required personal information');
      return;
    }
    if (_docFront == null) {
      AppNotifications.error('Upload the front of your $_documentType');
      return;
    }
    if (_requiresBackImage && _docBack == null) {
      AppNotifications.error('Upload the back of your $_documentType');
      return;
    }

    setState(() => _submitting = true);
    final error = await Api.submitVerification(
      {
        'fullName': name,
        'email': email,
        'phone': _phone.text.trim(),
        'address': _address.text.trim(),
        'dateOfBirth': _dateOfBirth.text.trim(),
        'country': _country.text.trim(),
        'documentType': _documentType,
        'officialWebsite': _officialWebsite.text.trim(),
        'socialLinks': _socialLinks.text.trim(),
        'newsLinks': _newsLinks.text.trim(),
        'vatNumber': _vatNumber.text.trim(),
        'businessWebsite': _businessWebsite.text.trim(),
      },
      documents: [
        _docFront!.withField('docFront'),
        if (_docBack != null) _docBack!.withField('docBack'),
        if (_brandProof != null) _brandProof!.withField('brandProof'),
        if (_businessReg != null) _businessReg!.withField('businessReg'),
        if (_companyDocs != null) _companyDocs!.withField('companyDocs'),
      ],
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (error != null) {
      AppNotifications.error('Verification failed', error);
      return;
    }
    AppNotifications.success(
      'Application submitted',
      'Review usually completes within 7 business days.',
    );
    setState(() {
      _docFront = null;
      _docBack = null;
      _brandProof = null;
      _businessReg = null;
      _companyDocs = null;
    });
    await _load();
  }

  void _resubmit() {
    setState(() {
      _showForm = true;
      _step = 0;
    });
  }

  bool _canProceedCurrentStep() {
    switch (_step) {
      case 0:
        return _fullName.text.trim().isNotEmpty &&
            _email.text.trim().contains('@') &&
            _address.text.trim().isNotEmpty &&
            _dateOfBirth.text.trim().isNotEmpty &&
            _country.text.trim().isNotEmpty;
      case 1:
        return _docFront != null && (!_requiresBackImage || _docBack != null);
      default:
        return true;
    }
  }

  void _nextStep() {
    if (!_canProceedCurrentStep()) {
      switch (_step) {
        case 0:
          AppNotifications.error(
            'Please fill in all required personal information',
          );
          break;
        case 1:
          AppNotifications.error(
            _requiresBackImage
                ? 'Upload front and back images of your $_documentType'
                : 'Upload the front image of your Passport',
          );
          break;
      }
      return;
    }
    if (_step < _steps.length - 1) {
      setState(() => _step += 1);
    }
  }

  void _previousStep() {
    if (_step > 0) {
      setState(() => _step -= 1);
    }
  }

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
          final matches = _countryCatalog
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

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        title: const Text(
          'Identity Verification',
          style: TextStyle(
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
      body: SafeArea(
        top: false,
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.textGray300,
          backgroundColor: AppColors.bg1,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 30),
            children: [
              Text(
                _cleanKycText(
                  'Confirm your identity to unlock withdrawals and the verified badge.',
                ),
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.45,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 18),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ),
                )
              else ...[
                if (state == _KycState.approved)
                  _verifiedWebPanel()
                else ...[
                  _banner(state),
                  if (state == _KycState.rejected && !_showForm) ...[
                    const SizedBox(height: 14),
                    _resubmitButton(),
                  ],
                  if (_showForm) ...[const SizedBox(height: 18), _form()],
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _banner(_KycState state) {
    final submitted =
        '${_record['submitted_at'] ?? _record['created_at'] ?? ''}'.trim();
    final reason = '${_record['rejection_reason'] ?? ''}'.trim();
    final (
      IconData icon,
      Color tint,
      Color fill,
      Color border,
      String title,
      String body,
    ) = switch (state) {
      _KycState.approved => (
        Ionicons.shield_checkmark,
        AppColors.successGreen,
        _greenFill,
        _greenBorder,
        'Account verified',
        'Your account is verified. Withdrawals are unlocked.',
      ),
      _KycState.pending => (
        Ionicons.time_outline,
        _amber,
        _amberFill,
        _amberBorder,
        'Under review',
        'Your application is being reviewed. We will notify you within 7 business days.',
      ),
      _KycState.rejected => (
        Ionicons.close_circle_outline,
        AppColors.likeRed,
        _redFill,
        _redBorder,
        'Verification rejected',
        reason.isEmpty
            ? 'Your application was not approved. Please review the details and resubmit.'
            : reason,
      ),
      _KycState.none => (
        Ionicons.shield_outline,
        AppColors.textGray300,
        const Color(0x0FFFFFFF),
        _webBorder,
        'Not applied yet',
        'Submit your identity details to get verified.',
      ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: tint),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: tint,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 11,
                    height: 1.5,
                    color: AppColors.textGray500,
                  ),
                ),
                if (submitted.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Submitted · ${Api.postedDate(submitted)}',
                    style: const TextStyle(
                      fontSize: 9.5,
                      color: AppColors.textGray600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _resubmitButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _resubmit,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          side: const BorderSide(color: _webBorder),
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          'RESUBMIT APPLICATION',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _verifiedWebPanel() {
    final submitted =
        '${_record['submitted_at'] ?? _record['created_at'] ?? ''}';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        color: _greenFill,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _greenBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Ionicons.shield_checkmark, size: 34, color: Colors.white),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Account Verified',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.successGreen,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Your account has been verified. A blue badge now appears next to your name.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.45,
                    color: AppColors.textGray300,
                  ),
                ),
                if (submitted.trim().isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text(
                    'Submitted: ${Api.postedDate(submitted)}',
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textGray600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ignore: unused_element
  Widget _verifiedPanel() {
    final rows = <(String, String)>[
      ('Name', '${_record['full_name'] ?? '—'}'),
      ('Document', '${_record['document_type'] ?? '—'}'),
      ('Country', '${_record['country'] ?? '—'}'),
    ];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _greenBorder),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: _greenFill,
              shape: BoxShape.circle,
              border: Border.all(color: _greenBorder),
            ),
            child: const Icon(
              Ionicons.shield_checkmark,
              size: 26,
              color: AppColors.successGreen,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Verified',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.successGreen,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Nothing more to do — withdrawals are unlocked.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11.5,
              height: 1.45,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 16),
          for (final (label, value) in rows) ...[
            Row(
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.textGray500,
                  ),
                ),
                const Spacer(),
                Flexible(
                  child: Text(
                    value.trim().isEmpty ? '—' : value,
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _form() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _stepStrip(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _stepBody(),
                const SizedBox(height: 22),
                _stepActions(),
                const SizedBox(height: 14),
                _progressDots(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepStrip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: _webBorder)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var i = 0; i < _steps.length; i++)
              GestureDetector(
                onTap: () => setState(() => _step = i),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 14, 8, 0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (i < _step) ...[
                            const Icon(
                              Ionicons.checkmark_circle,
                              size: 14,
                              color: Color(0xFF14E39A),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Text(
                            _steps[i],
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: i == _step
                                  ? Colors.white
                                  : i < _step
                                  ? const Color(0xFF14E39A)
                                  : AppColors.textGray500,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 11),
                      Container(
                        width: i == 0 ? 110 : 96,
                        height: 2,
                        color: i == _step ? Colors.white : Colors.transparent,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _stepBody() {
    switch (_step) {
      case 0:
        return _personalStep();
      case 1:
        return _identityStep();
      case 2:
        return _authenticityStep();
      default:
        return _businessStep();
    }
  }

  Widget _personalStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Personal Information'),
        const Text(
          'Provide your personal details to confirm your identity. Fields marked * are required.',
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 18),
        _microLabel('FULL NAME *'),
        const SizedBox(height: 8),
        _input(_fullName, 'Enter your legal full name'),
        const SizedBox(height: 16),
        _microLabel('EMAIL ADDRESS *'),
        const SizedBox(height: 8),
        _input(_email, 'you@example.com', keyboard: TextInputType.emailAddress),
        const SizedBox(height: 16),
        _microLabel('PHONE NUMBER (OPTIONAL)'),
        const SizedBox(height: 8),
        _input(_phone, '5555000', keyboard: TextInputType.phone),
        const SizedBox(height: 16),
        _microLabel('ADDRESS *'),
        const SizedBox(height: 8),
        _input(_address, 'Your residential address', maxLines: 3),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _microLabel('DATE OF BIRTH *'),
                  const SizedBox(height: 8),
                  _input(
                    _dateOfBirth,
                    'mm/dd/yyyy',
                    keyboard: TextInputType.datetime,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _microLabel('COUNTRY *'),
                  const SizedBox(height: 8),
                  _pickerField(
                    value: _country.text,
                    placeholder: 'Select country',
                    onTap: _pickCountry,
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _identityStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Identity Documents'),
        const Text(
          'Upload clear photos of your identification document. Photos must be legible and unobstructed.',
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 18),
        _microLabel('DOCUMENT TYPE *'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [for (final type in _documentTypes) _typeChip(type)],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            _microLabel('UPLOAD PHOTOS *'),
            const SizedBox(width: 8),
            Text(
              _requiresBackImage ? 'Front & Back required' : 'Front only',
              style: const TextStyle(
                fontSize: 10.5,
                color: AppColors.textGray600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _uploadTile(
                label: _documentType == 'Passport'
                    ? 'Front of Passport *'
                    : 'Front of $_documentType *',
                subtitle: 'JPG, PNG or PDF',
                file: _docFront,
                onTap: () => _pickSingleUpload(
                  field: 'docFront',
                  onPicked: (file) => _docFront = file,
                ),
              ),
            ),
            if (_requiresBackImage) ...[
              const SizedBox(width: 12),
              Expanded(
                child: _uploadTile(
                  label: 'Back of $_documentType *',
                  subtitle: 'JPG, PNG or PDF',
                  file: _docBack,
                  onTap: () => _pickSingleUpload(
                    field: 'docBack',
                    onPicked: (file) => _docBack = file,
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _fieldFill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _webBorder),
          ),
          child: const Text(
            'Photos will only be used to confirm your identity and will be submitted for deletion when the review process is complete.',
            style: TextStyle(fontSize: 10.5, color: AppColors.textGray600),
          ),
        ),
      ],
    );
  }

  Widget _authenticityStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Confirm Notability'),
        const Text(
          'Show that the public figure, celebrity, or brand your account represents is in the public interest.',
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'ALL FIELDS OPTIONAL',
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
            color: AppColors.textGray600,
          ),
        ),
        const SizedBox(height: 18),
        _microLabel('OFFICIAL WEBSITE'),
        const SizedBox(height: 8),
        _input(_officialWebsite, 'https://yourwebsite.com'),
        const SizedBox(height: 12),
        _microLabel('INSTAGRAM / YOUTUBE / SOCIAL LINKS'),
        const SizedBox(height: 8),
        _input(
          _socialLinks,
          'https://instagram.com/yourhandle\nhttps://youtube.com/@yourchannel',
          maxLines: 3,
        ),
        const SizedBox(height: 12),
        _microLabel('NEWS / ARTICLE LINKS'),
        const SizedBox(height: 8),
        _input(
          _newsLinks,
          'https://news.com/article-about-you\nhttps://magazine.com/feature',
          maxLines: 3,
        ),
        const SizedBox(height: 12),
        _microLabel('BRAND OWNERSHIP PROOF'),
        const SizedBox(height: 8),
        _uploadTile(
          label: 'Upload brand proof',
          subtitle: 'Trademark cert, logo rights, etc.',
          file: _brandProof,
          onTap: () => _pickSingleUpload(
            field: 'brandProof',
            onPicked: (file) => _brandProof = file,
          ),
        ),
      ],
    );
  }

  Widget _businessStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Business Verification'),
        const Text(
          'Recommended for business sellers, brands, and organisations.',
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'ALL FIELDS OPTIONAL — SKIP IF NOT APPLICABLE',
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
            color: AppColors.textGray600,
          ),
        ),
        const SizedBox(height: 18),
        _microLabel('VAT / TAX NUMBER'),
        const SizedBox(height: 8),
        _input(_vatNumber, 'Your VAT or tax registration number'),
        const SizedBox(height: 12),
        _microLabel('OFFICIAL BUSINESS WEBSITE'),
        const SizedBox(height: 8),
        _input(_businessWebsite, 'https://business.com'),
        const SizedBox(height: 12),
        _microLabel('BUSINESS REGISTRATION CERTIFICATE'),
        const SizedBox(height: 8),
        _uploadTile(
          label: 'Upload registration certificate',
          subtitle: 'PDF or image',
          file: _businessReg,
          onTap: () => _pickSingleUpload(
            field: 'businessReg',
            onPicked: (file) => _businessReg = file,
          ),
        ),
        const SizedBox(height: 12),
        _microLabel('COMPANY DOCUMENTS'),
        const SizedBox(height: 8),
        _uploadTile(
          label: 'Upload company documents',
          subtitle: 'Memorandum, articles, etc.',
          file: _companyDocs,
          onTap: () => _pickSingleUpload(
            field: 'companyDocs',
            onPicked: (file) => _companyDocs = file,
          ),
        ),
        const SizedBox(height: 18),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _fieldFill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _webBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'REVIEW SUMMARY',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 12),
              _summaryRow('Full Name', _fullName.text),
              _summaryRow('Email', _email.text),
              _summaryRow('Document', _documentType),
              _summaryRow('Country', _country.text),
              _summaryRow('Address', _address.text),
            ],
          ),
        ),
      ],
    );
  }

  Widget _stepActions() {
    final isLast = _step == _steps.length - 1;
    return Row(
      children: [
        if (_step > 0)
          Expanded(
            child: _navButton(
              label: 'PREVIOUS',
              dark: true,
              icon: Ionicons.chevron_back_outline,
              onTap: _previousStep,
            ),
          ),
        if (_step > 0) const SizedBox(width: 14),
        Expanded(
          flex: isLast ? 2 : 1,
          child: _navButton(
            label: isLast
                ? (_submitting ? 'SUBMITTING…' : 'SUBMIT APPLICATION')
                : 'NEXT STEP',
            dark: false,
            icon: isLast ? null : Ionicons.chevron_forward_outline,
            onTap: isLast ? (_submitting ? null : _submit) : _nextStep,
          ),
        ),
      ],
    );
  }

  Widget _progressDots() {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            Container(
              width: i == _step ? 24 : 10,
              height: 8,
              decoration: BoxDecoration(
                color: i < _step
                    ? const Color(0xFF14E39A)
                    : i == _step
                    ? Colors.white
                    : const Color(0xFF334155),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            if (i != _steps.length - 1) const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }

  Widget _navButton({
    required String label,
    required bool dark,
    required VoidCallback? onTap,
    IconData? icon,
  }) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: dark ? Colors.black : Colors.white,
        foregroundColor: dark ? Colors.white : Colors.black,
        disabledBackgroundColor: dark
            ? const Color(0xFF161616)
            : const Color(0xFF2A2A2A),
        disabledForegroundColor: AppColors.textGray600,
        side: BorderSide(color: dark ? _webBorder : Colors.white),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null && dark) ...[
            Icon(icon, size: 15),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
          if (icon != null && !dark) ...[
            const SizedBox(width: 6),
            Icon(icon, size: 15),
          ],
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textGray500,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value.trim().isEmpty ? '—' : value.trim(),
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pickerField({
    required String value,
    required String placeholder,
    required VoidCallback onTap,
  }) {
    final hasValue = value.trim().isNotEmpty;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          color: _fieldFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _webBorder),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                hasValue ? value.trim() : placeholder,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: hasValue ? Colors.white : AppColors.textGray600,
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              Ionicons.chevron_down_outline,
              size: 16,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
    ),
  );

  Widget _typeChip(String type) {
    final selected = _documentType == type;
    return GestureDetector(
      onTap: () => setState(() => _documentType = type),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? Colors.white : _fieldFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? Colors.white : _webBorder),
        ),
        child: Text(
          type,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.black : AppColors.textGray400,
          ),
        ),
      ),
    );
  }

  Widget _uploadTile({
    required String label,
    required String subtitle,
    required ApiUploadFile? file,
    required VoidCallback onTap,
  }) {
    final hasFile = file != null;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 14),
        decoration: BoxDecoration(
          color: hasFile ? _greenFill : _fieldFill,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: hasFile ? _greenBorder : _webBorder),
        ),
        child: Column(
          children: [
            Icon(
              hasFile
                  ? Ionicons.checkmark_circle
                  : Ionicons.cloud_upload_outline,
              size: 26,
              color: hasFile ? AppColors.successGreen : AppColors.textGray500,
            ),
            const SizedBox(height: 10),
            Text(
              hasFile ? file.filename : label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: hasFile ? AppColors.successGreen : AppColors.textGray300,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              hasFile ? 'Tap to change' : subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10,
                color: AppColors.textGray600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _microLabel(String text) => Text(
    text,
    style: const TextStyle(
      fontSize: 9.5,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.3,
      color: AppColors.textGray500,
    ),
  );

  Widget _input(
    TextEditingController controller,
    String hint, {
    TextInputType? keyboard,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboard,
      maxLines: maxLines,
      style: const TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w500,
        color: Colors.white,
      ),
      decoration: InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 13,
        ),
        filled: true,
        fillColor: _fieldFill,
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray600,
        ),
        border: _fieldBorder(_webBorder),
        enabledBorder: _fieldBorder(_webBorder),
        focusedBorder: _fieldBorder(const Color(0x4DFFFFFF)),
      ),
    );
  }

  OutlineInputBorder _fieldBorder(Color color) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(14),
    borderSide: BorderSide(color: color),
  );
}
