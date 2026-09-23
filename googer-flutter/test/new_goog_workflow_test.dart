import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/ad_campaign_screen.dart';

void main() {
  testWidgets('New Goog applies plan limits and renders the Web link preview', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => AdCampaignScreen.showWriteGoogDialog(
                  context,
                  features: const {
                    'goog_letter_limit': 100,
                    'write_goog_color_limit': 3,
                  },
                ),
                child: const Text('OPEN'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('OPEN'));
    await tester.pumpAndSettle();
    expect(find.text('Write a Goog'), findsNWidgets(2));
    expect(find.text('0/100'), findsOneWidget);

    await tester.enterText(
      find.byType(TextField),
      'watch https://www.youtube.com/watch?v=abc123',
    );
    await tester.pump();

    expect(find.byKey(const Key('write-goog-link-preview')), findsOneWidget);
    expect(find.text('youtube.com'), findsOneWidget);
    expect(find.text('YouTube'), findsOneWidget);
    expect(find.text('44/100'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Edit Goog reuses the same plan-aware editor', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => AdCampaignScreen.showWriteGoogDialog(
                  context,
                  features: const {
                    'goog_letter_limit': 25,
                    'write_goog_color_limit': 2,
                  },
                  initialText: 'https://googer.site',
                  submit: (_, __) async => null,
                ),
                child: const Text('EDIT'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('EDIT'));
    await tester.pumpAndSettle();

    expect(find.text('Edit Goog'), findsOneWidget);
    expect(find.text('19/25'), findsOneWidget);
    expect(find.byKey(const Key('write-goog-link-preview')), findsOneWidget);
    expect(find.text('googer.site'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
