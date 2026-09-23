import 'package:flutter/material.dart';

import '../api/api.dart';
import '../data/mock.dart';
import '../theme/colors.dart';
import '../widgets/app_back_button.dart';
import 'home_feed_screen.dart';

/// Public upload-content route used by Web share and Share & Earn links.
///
/// The optional reseller reference is merged into the API item before it is
/// rendered so direct purchases and creator subscriptions use the same wallet
/// attribution contract as the Next.js `/reel/[shareCode]` page.
class ReelScreen extends StatefulWidget {
  final String shareCode;
  final String resellerRef;

  const ReelScreen({super.key, required this.shareCode, this.resellerRef = ''});

  @override
  State<ReelScreen> createState() => _ReelScreenState();
}

class _ReelScreenState extends State<ReelScreen> {
  UploadContent? _item;
  String _error = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) {
      setState(() {
        _loading = true;
        _error = '';
      });
    }
    final raw = await Api.uploadContentByShareCode(widget.shareCode);
    if (!mounted) return;
    if (raw == null) {
      setState(() {
        _loading = false;
        _error = 'This content is not available.';
      });
      return;
    }
    final attributed = Map<String, dynamic>.from(raw);
    if (widget.resellerRef.trim().isNotEmpty) {
      attributed['reseller_ref'] = widget.resellerRef.trim();
      attributed['resell_ref'] = widget.resellerRef.trim();
    }
    final parsed = Api.parseUploadContent(attributed);
    setState(() {
      _loading = false;
      _item = parsed;
      _error = parsed == null ? 'This content is not available.' : '';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(10, 4, 10, 2),
              child: Align(
                alignment: Alignment.centerLeft,
                child: AppBackButton(),
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
      );
    }
    final item = _item;
    if (item == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _error,
              style: const TextStyle(
                color: AppColors.textGray400,
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(0, 4, 0, 24),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 500),
              child: UploadFeedCard(
                item: item,
                onRefresh: ({bool silent = false}) => _load(silent: silent),
                onHide: () => Navigator.maybePop(context),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
