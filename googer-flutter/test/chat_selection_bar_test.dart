import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/widgets/chat_selection_bar.dart';

/// This bar only renders once a message is selected, which the thread smoke
/// test can't reach without network data — so it shipped with the count
/// squeezed to zero width (wrapping one letter per line) and CANCEL clipped
/// off-screen. Testing it directly closes that gap.
void main() {
  Widget host(double width, {int count = 1}) => MaterialApp(
    home: Scaffold(
      body: SizedBox(
        width: width,
        child: ChatSelectionBar(
          count: count,
          onCopy: () {},
          onForward: () {},
          onDelete: () {},
          onCancel: () {},
        ),
      ),
    ),
  );

  for (final width in const [430.0, 390.0, 360.0, 320.0]) {
    testWidgets('lays out at ${width}px without overflow', (tester) async {
      await tester.binding.setSurfaceSize(Size(width, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(host(width));
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('1 SELECTED'), findsOneWidget);
      for (final label in const ['COPY', 'FORWARD', 'DELETE', 'CANCEL']) {
        expect(find.text(label), findsOneWidget, reason: '$label missing');
      }
    });
  }

  testWidgets('the count stays on one line', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(host(320));
    await tester.pump();

    // A squeezed label wraps per character and grows very tall; a healthy one
    // stays a single line.
    final size = tester.getSize(find.text('1 SELECTED'));
    expect(size.height, lessThan(24),
        reason: 'the count wrapped instead of staying on one line');
    expect(size.width, greaterThan(40));
  });

  testWidgets('every action is reachable at the narrowest width', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    var cancelled = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 320,
            child: ChatSelectionBar(
              count: 3,
              onCopy: () {},
              onForward: () {},
              onDelete: () {},
              onCancel: () => cancelled = true,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // CANCEL is the one that used to be clipped — scroll it in and tap it.
    await tester.dragUntilVisible(
      find.text('CANCEL'),
      find.byType(SingleChildScrollView),
      const Offset(-80, 0),
    );
    await tester.tap(find.text('CANCEL'));
    await tester.pump();

    expect(cancelled, isTrue);
    expect(tester.takeException(), isNull);
  });
}
