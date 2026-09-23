import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ionicons/ionicons.dart';
import 'package:googer_app/screens/transactions_screen.dart';
import 'package:googer_app/widgets/app_back_button.dart';

/// Every screen goes back through one control: a chevron plus the word BACK,
/// the shape the wallet pages introduced.
void main() {
  testWidgets('renders a chevron and the BACK label', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: AppBackButton())),
    );

    expect(find.text('BACK'), findsOneWidget);
    expect(find.byIcon(Ionicons.chevron_back), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pops the route by default', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      const Scaffold(body: Center(child: AppBackButton())),
                ),
              ),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('BACK'), findsOneWidget);

    await tester.tap(find.text('BACK'));
    await tester.pumpAndSettle();
    expect(find.text('go'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an explicit onTap wins over popping', (tester) async {
    var tapped = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AppBackButton(onTap: () => tapped++)),
      ),
    );

    await tester.tap(find.text('BACK'));
    await tester.pump();
    expect(tapped, 1);
  });

  testWidgets('fits an AppBar leading slot without clipping', (tester) async {
    // The default 56px slot is too narrow for the label; screens must pair the
    // button with `leadingWidth`, so check the label survives at 320px.
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            leadingWidth: AppBackButton.appBarLeadingWidth,
            leading: const AppBackButton.appBar(),
            title: const Text('Transaction History'),
          ),
        ),
      ),
    );

    final label = tester.getRect(find.text('BACK'));
    final slot = tester.getRect(find.byType(AppBackButton));
    expect(label.width, greaterThan(30), reason: 'BACK was squeezed away');
    expect(
      label.right,
      lessThanOrEqualTo(slot.right + 0.5),
      reason: 'BACK spilled out of the leading slot',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('a converted screen uses it', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MaterialApp(home: TransactionsScreen()));
    await tester.pump();

    expect(find.byType(AppBackButton), findsOneWidget);
    expect(find.text('BACK'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('no screen hand-rolls its own back button', () {
    // Guards the convention at the source level: a new screen adding a bare
    // back IconButton would pass every widget test above while still looking
    // different from the rest of the app.
    final offenders = <String>[];
    final dir = Directory('lib');

    for (final file in dir.listSync(recursive: true).whereType<File>()) {
      if (!file.path.endsWith('.dart')) continue;
      if (file.path.endsWith('app_back_button.dart')) continue;
      final source = file.readAsStringSync();

      if (source.contains('leading: IconButton(')) {
        offenders.add('${file.path}: back button in an AppBar leading slot');
      }
      // Carousel/stepper arrows are `chevron_back`, which the shared button
      // also uses - only the arrow_back family is a page-back tell.
      if (RegExp(r'Ionicons\.arrow_back').hasMatch(source)) {
        offenders.add('${file.path}: raw arrow_back icon');
      }
    }

    expect(
      offenders,
      isEmpty,
      reason: 'use AppBackButton instead:\n${offenders.join("\n")}',
    );
  });
}
