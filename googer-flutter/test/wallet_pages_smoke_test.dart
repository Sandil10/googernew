import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/screens/subscription_screen.dart';
import 'package:googer_app/screens/wallet_verification_screen.dart';
import 'package:googer_app/screens/withdrawal_screen.dart';

/// Withdrawal, KYC and Subscription all stack dense label/value rows inside
/// cards, which is exactly where this codebase has shipped RenderFlex
/// overflows before. Every screen is pumped at three widths *and scrolled all
/// the way down*, because a ListView never lays out the rows below the fold —
/// an unscrolled smoke test would miss the overflow it is meant to catch.
/// `takeException` surfaces overflow errors, so any of them fails the test.
void main() {
  setUp(() {
    Api.token = null;
    Api.user = null;
  });

  Future<void> open(WidgetTester tester, Widget screen, Size size) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home: screen));
    // Two pumps: the first settles the initial frame, the second lets the
    // `_load()` futures resolve into the loaded (form + list) tree.
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// Brings [text] into view if it starts below the fold, then asserts it.
  Future<void> expectHeading(
    WidgetTester tester,
    String screen,
    String text,
  ) async {
    if (find.text(text).evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        find.text(text),
        250,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 60,
      );
    }
    expect(find.text(text), findsOneWidget, reason: '$screen has no "$text"');
  }

  /// Drags to the bottom so every card below the fold is laid out at least
  /// once at this width.
  Future<void> sweepToBottom(WidgetTester tester) async {
    final scrollable = find.byType(Scrollable).first;
    for (var i = 0; i < 12; i++) {
      await tester.drag(scrollable, const Offset(0, -300));
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'layout error on scroll');
    }
  }

  const sizes = [Size(430, 900), Size(360, 780), Size(320, 700)];

  const screens = <(String, Widget, List<String>)>[
    ('withdrawal', WithdrawalScreen(), ['WITHDRAWAL PROGRESS']),
    ('verification', WalletVerificationScreen(), ['Not applied yet']),
    // Subscription is not in this loop: it is a modal-style page with a close
    // control rather than BACK. See subscription_ad_center_test.dart.
  ];

  for (final (name, screen, headings) in screens) {
    for (final size in sizes) {
      testWidgets('$name renders at ${size.width.toInt()}px', (tester) async {
        await open(tester, screen, size);

        expect(tester.takeException(), isNull);
        expect(find.text('BACK'), findsOneWidget);
        for (final heading in headings) {
          await expectHeading(tester, name, heading);
          expect(tester.takeException(), isNull);
        }
        await sweepToBottom(tester);
      });
    }
  }

  testWidgets('withdrawal gates ID verification behind coin progress', (tester) async {
    // Tall surface so the whole page is built in one frame.
    await open(tester, const WithdrawalScreen(), const Size(360, 1800));

    // No session in tests, so verification comes back empty → locked state.
    expect(find.text('ID VERIFICATION'), findsOneWidget);
    expect(find.text('WITHDRAWAL PROGRESS'), findsOneWidget);
    expect(
      find.textContaining('more coins to unlock ID Verification'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('verification opens on the personal-information step', (
    tester,
  ) async {
    await open(tester, const WalletVerificationScreen(), const Size(320, 1800));

    expect(find.text('Not applied yet'), findsOneWidget);
    expect(find.text('FULL NAME *'), findsOneWidget);
    for (final step in const [
      'Personal Info',
      'Identity',
      'Authenticity',
      'Business',
    ]) {
      expect(find.text(step), findsOneWidget);
    }
    expect(find.text('NEXT STEP'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('subscription says so when no plans are on sale', (tester) async {
    await open(tester, const SubscriptionScreen(), const Size(320, 1800));

    // Signed out, so the public plan list comes back empty.
    expect(find.text('Choose Your Plan'), findsOneWidget);
    expect(find.text('No plans are on sale right now'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
