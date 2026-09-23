import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/add_product_screen.dart';

/// Real phone dimensions — a tall surface hides the layout errors this is
/// meant to catch. Covers the mode gate and the state after a mode is chosen,
/// since those render completely different trees.
void main() {
  for (final size in const [Size(430, 900), Size(360, 780)]) {
    testWidgets('renders at ${size.width}x${size.height}', (tester) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: AddProductScreen()));
      await tester.pump(const Duration(milliseconds: 300));

      expect(tester.takeException(), isNull);
      expect(find.text('Add Listing'), findsOneWidget);
      expect(find.text('CHOOSE MODE'), findsOneWidget);
      expect(find.text('ADD NEW'), findsOneWidget);
    });
  }

  testWidgets('validation blocks an empty publish', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MaterialApp(home: AddProductScreen()));
    await tester.pump(const Duration(milliseconds: 300));

    // The screen has more than one Scrollable (page list + media strip), so
    // the drag target has to be named explicitly.
    await tester.dragUntilVisible(
      find.text('PUBLISH PRODUCT'),
      find.byType(ListView).first,
      const Offset(0, -350),
    );
    await tester.tap(find.text('PUBLISH PRODUCT'));
    await tester.pump(const Duration(milliseconds: 300));

    // Must not throw, and must still be on the form rather than having
    // submitted an incomplete listing.
    expect(tester.takeException(), isNull);
    expect(find.text('Add Listing'), findsOneWidget);
  });

  testWidgets('choosing a mode opens the media step', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MaterialApp(home: AddProductScreen()));
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('CHOOSE MODE'));
    await tester.pumpAndSettle();
    expect(find.text('Single Product'), findsOneWidget);
    expect(find.text('Multiple Variants'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
