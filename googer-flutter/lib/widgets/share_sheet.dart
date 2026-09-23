import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api.dart';
import '../theme.dart';
import '../util/open_link.dart';

void showShareSheet(
  BuildContext context, {
  required String title,
  required String url,
  String subtitle = '',
  String linkLabel = 'Link',
  bool canEarn = false,
  String commission = '',
  String earnTitle = 'Share & Earn',
  String earnSubtitle = 'Create your personalized share link',
  String earnKind = 'Generate Share',
  String Function(String id)? earnUrlBuilder,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ShareSheet(
      title: title,
      subtitle: subtitle,
      url: url,
      linkLabel: linkLabel,
      canEarn: canEarn,
      commission: commission.replaceFirst(RegExp(r'%$'), '').trim(),
      earnTitle: earnTitle,
      earnSubtitle: earnSubtitle,
      earnKind: earnKind,
      earnUrlBuilder:
          earnUrlBuilder ?? (id) => '$url/${Uri.encodeComponent(id)}',
    ),
  );
}

class _ShareSheet extends StatefulWidget {
  final String title;
  final String subtitle;
  final String url;
  final String linkLabel;
  final bool canEarn;
  final String commission;
  final String earnTitle;
  final String earnSubtitle;
  final String earnKind;
  final String Function(String id) earnUrlBuilder;

  const _ShareSheet({
    required this.title,
    required this.subtitle,
    required this.url,
    required this.linkLabel,
    required this.canEarn,
    required this.commission,
    required this.earnTitle,
    required this.earnSubtitle,
    required this.earnKind,
    required this.earnUrlBuilder,
  });

  @override
  State<_ShareSheet> createState() => _ShareSheetState();
}

class _ShareSheetState extends State<_ShareSheet> {
  final TextEditingController _id = TextEditingController();
  bool _earnView = false;
  bool _copied = false;
  String _generated = '';
  String _error = '';
  Timer? _copiedTimer;

  @override
  void initState() {
    super.initState();
    _id.text = Api.googerId.isNotEmpty
        ? Api.googerId
        : (Api.username.isNotEmpty ? Api.username : Api.currentUserId);
  }

  @override
  void dispose() {
    _copiedTimer?.cancel();
    _id.dispose();
    super.dispose();
  }

  void _copy(String value) {
    Clipboard.setData(ClipboardData(text: value));
    _copiedTimer?.cancel();
    setState(() => _copied = true);
    _copiedTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  String _normalizeId(String value) =>
      value.trim().replaceFirst(RegExp(r'^@+'), '').toLowerCase();

  bool _isOwnId(String value) {
    final n = _normalizeId(value);
    if (n.isEmpty) return false;
    return n == _normalizeId(Api.googerId) ||
        n == _normalizeId(Api.currentUserId) ||
        n == _normalizeId(Api.username);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 10,
          right: 10,
          bottom: 10 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.94,
          ),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
          decoration: BoxDecoration(
            color: const Color(0xFF0F0F0F),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: GoogerColors.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 7),
              Flexible(
                fit: FlexFit.loose,
                child: SingleChildScrollView(
                  child: _earnView ? _earnBody() : _shareBody(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(String title, String subtitle) {
    return Column(
      children: [
        Row(
          children: [
            if (_earnView) ...[
              GestureDetector(
                key: const Key('legacy-share-link-back'),
                onTap: () => setState(() => _earnView = false),
                behavior: HitTestBehavior.opaque,
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.chevron_left, size: 21, color: Colors.white),
                      SizedBox(width: 5),
                      Text(
                        'BACK',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  if (subtitle.trim().isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w500,
                        color: GoogerColors.dim,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close, color: Colors.white, size: 20),
              visualDensity: VisualDensity.compact,
              style: IconButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.07),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        const Divider(height: 1, color: GoogerColors.line),
      ],
    );
  }

  Widget _shareBody() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header('Share', widget.subtitle),
        if (_copied) Center(child: _copiedPill()),
        const SizedBox(height: 14),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: [
            _target('WhatsApp', Icons.chat, const Color(0xFF25D366), () {
              openExternalLink(
                'https://api.whatsapp.com/send?text=${Uri.encodeComponent('${widget.title}\n\n${widget.url}')}',
              );
            }),
            _target('Facebook', Icons.facebook, const Color(0xFF1877F2), () {
              openExternalLink(
                'https://www.facebook.com/sharer/sharer.php?u=${Uri.encodeComponent(widget.url)}',
              );
            }),
            _target(
              'Instagram',
              Icons.camera_alt_outlined,
              const Color(0xFFDD2A7B),
              () => _copy(widget.url),
            ),
            _target(
              'X (Twitter)',
              Icons.close,
              Colors.black,
              () => openExternalLink(
                'https://twitter.com/intent/tweet?url=${Uri.encodeComponent(widget.url)}&text=${Uri.encodeComponent(widget.title)}',
              ),
              glyph: 'X',
            ),
            _target(
              'Telegram',
              Icons.send,
              const Color(0xFF27A7E5),
              () => openExternalLink(
                'https://t.me/share/url?url=${Uri.encodeComponent(widget.url)}&text=${Uri.encodeComponent(widget.title)}',
              ),
            ),
            _target(
              'Copy Link',
              Icons.link,
              const Color(0xFF2A2A2A),
              () => _copy(widget.url),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _linkBox(widget.linkLabel, widget.url),
        if (widget.canEarn) ...[const SizedBox(height: 22), _shareEarnAction()],
      ],
    );
  }

  Widget _earnBody() {
    final pct = widget.commission.trim();
    final hasCommission = pct.isNotEmpty;
    final generated = _generated.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          'Share Link',
          widget.linkLabel.toLowerCase().contains('product')
              ? 'Earn commission on every sale'
              : 'Share this content and earn when eligible viewers watch through your link',
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: hasCommission
                ? const Color(0xFF201608)
                : Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: hasCommission
                  ? const Color(0x33F59E0B)
                  : Colors.white.withValues(alpha: 0.06),
            ),
          ),
          child: Row(
            children: [
              Container(
                constraints: const BoxConstraints(minWidth: 64),
                height: 64,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: hasCommission
                      ? const Color(0xFF5A3805)
                      : Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  hasCommission ? '$pct%' : '-',
                  style: TextStyle(
                    color: hasCommission
                        ? const Color(0xFFFBBF24)
                        : Colors.white.withValues(alpha: 0.20),
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SHARE COMMISSION',
                      style: TextStyle(
                        color: GoogerColors.dim,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.4,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      hasCommission
                          ? '$pct% per eligible watch'
                          : 'Not set for this content',
                      style: TextStyle(
                        color: hasCommission
                            ? Colors.white
                            : Colors.white.withValues(alpha: 0.45),
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (hasCommission) ...[
                      const SizedBox(height: 4),
                      const Text(
                        'Credited after eligible watch.',
                        style: TextStyle(
                          color: Color(0xFFD69A00),
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Overline(
          'Enter your Googer ID or username',
          color: GoogerColors.dim,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _id,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.person_outline),
          ),
          onChanged: (_) {
            if (_error.isNotEmpty || _generated.isNotEmpty) {
              setState(() {
                _error = '';
                _generated = '';
              });
            }
          },
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF9F0A),
              foregroundColor: Colors.black,
            ),
            onPressed: () {
              final value = _id.text.trim();
              if (!_isOwnId(value)) {
                setState(() {
                  _generated = '';
                  _error = 'Only your own account identifier is allowed.';
                });
                return;
              }
              setState(() {
                _error = '';
                _generated = widget.earnUrlBuilder(value);
              });
            },
            child: Text(widget.earnKind),
          ),
        ),
        const SizedBox(height: 12),
        Text.rich(
          TextSpan(
            text:
                'Only your own account identifier is allowed. Final link will combine code ',
            children: [
              TextSpan(
                text: Uri.tryParse(widget.url)?.pathSegments.last ?? '',
                style: const TextStyle(color: Color(0xFFFACC15)),
              ),
              const TextSpan(text: ' with your ID.'),
            ],
          ),
          style: const TextStyle(
            color: GoogerColors.dim,
            fontSize: 10.5,
            fontStyle: FontStyle.italic,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            _error,
            style: const TextStyle(color: GoogerColors.red, fontSize: 11),
          ),
        ],
        if (generated.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Row(
            children: [
              Icon(Icons.circle, size: 7, color: Color(0xFF10B981)),
              SizedBox(width: 10),
              Text(
                'SHARE LINK READY',
                style: TextStyle(
                  color: Color(0xFF10B981),
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _linkBox(
            'Your Share Link',
            generated,
            accent: const Color(0xFF00E6A8),
          ),
          const SizedBox(height: 16),
          const Overline('Share your share link', color: GoogerColors.dim),
        ],
      ],
    );
  }

  Widget _shareEarnAction() {
    return GestureDetector(
      key: const Key('legacy-upload-share-earn'),
      onTap: () => setState(() => _earnView = true),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: const Color(0xFF21170A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x66F59E0B)),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFF5A3805),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.layers_outlined,
                size: 20,
                color: Color(0xFFFBBF24),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.earnTitle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    widget.earnSubtitle,
                    style: const TextStyle(
                      color: Color(0xFFD69A00),
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 20, color: Colors.white),
          ],
        ),
      ),
    );
  }

  Widget _linkBox(String label, String value, {Color? accent}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Overline(label, color: GoogerColors.dim),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
          decoration: BoxDecoration(
            color: GoogerColors.soft6,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: GoogerColors.line),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: accent ?? GoogerColors.blue,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(72, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                ),
                onPressed: () => _copy(value),
                child: Text(
                  accent == null ? 'Copy' : 'Copy Share Link',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _copiedPill() => AnimatedOpacity(
    opacity: _copied ? 1 : 0,
    duration: const Duration(milliseconds: 180),
    child: Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: GoogerColors.green.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: GoogerColors.green.withValues(alpha: 0.35)),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle, size: 13, color: GoogerColors.green),
          SizedBox(width: 6),
          Text(
            'Copied',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: GoogerColors.green,
            ),
          ),
        ],
      ),
    ),
  );

  Widget _target(
    String label,
    IconData icon,
    Color color,
    VoidCallback onTap, {
    String? glyph,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.20),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Center(
              child: glyph == null
                  ? Icon(icon, size: 25, color: Colors.white)
                  : Text(
                      glyph,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11,
              color: GoogerColors.dim,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
