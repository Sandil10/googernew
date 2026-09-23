import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/widgets/campaign_editor.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Renders every campaign type end to end. The builder is the one screen a
/// user reaches with no fallback UI behind it, so a layout or assertion failure
/// there is a blank screen in release — exactly what a smoke test should catch
/// before a deploy does.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  // Flash and Vault now live in UploadContentStudio, not here — see
  // upload_content_studio_smoke_test.dart.
  for (final type in const [
    CampaignTypeTab.photoVideo,
    CampaignTypeTab.productPromote,
    CampaignTypeTab.profilePromote,
  ]) {
    // Real phone dimensions, not an oversized surface — the builder is a long
    // scrolling form and a tall viewport hides exactly the layout errors this
    // is meant to catch.
    for (final size in const [Size(430, 900), Size(360, 780), Size(320, 700)]) {
      testWidgets('renders $type at ${size.width}x${size.height}', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(size);
        addTearDown(() => tester.binding.setSurfaceSize(null));

        await tester.pumpWidget(
          MaterialApp(home: CampaignEditor.forType(type)),
        );
        await tester.pump(const Duration(milliseconds: 300));

        expect(tester.takeException(), isNull, reason: '$type threw on build');
        expect(find.text('AD BAR'), findsOneWidget);
        expect(find.text(CampaignTypeTab.labels[type]!), findsOneWidget);

        switch (type) {
          case CampaignTypeTab.photoVideo:
            expect(find.text('Apply Link'), findsOneWidget);
            expect(find.text('Select Ad Media'), findsOneWidget);
          case CampaignTypeTab.productPromote:
            expect(find.text('Apply Link'), findsOneWidget);
            expect(find.text('Select Ad Media'), findsNothing);
          case CampaignTypeTab.profilePromote:
            expect(find.text('Share Profile'), findsOneWidget);
            expect(find.text('Select Ad Media'), findsNothing);
        }
      });
    }
  }

  testWidgets('profile promote reveals featured sources only after Apply', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(home: CampaignEditor.forType(CampaignTypeTab.profilePromote)),
    );
    await tester.pump();

    expect(find.text('Featured Products'), findsNothing);
    expect(find.text('Featured Contents'), findsNothing);

    await tester.tap(find.text('APPLY'));
    await tester.pump();

    expect(find.text('Featured Products'), findsOneWidget);
    expect(find.text('Featured Contents'), findsOneWidget);
  });

  testWidgets(
    'photo/video preview switches between mobile and desktop frames',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(430, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        MaterialApp(home: CampaignEditor.forType(CampaignTypeTab.photoVideo)),
      );
      await tester.pump();

      final previewTitle = find.text('Ad Preview');
      await tester.dragUntilVisible(
        previewTitle,
        find.byType(ListView).first,
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();

      expect(find.text('MOBILE PREVIEW'), findsOneWidget);
      expect(find.text('DESKTOP PREVIEW'), findsNothing);

      await tester.tap(find.text('DESKTOP'));
      await tester.pumpAndSettle();

      expect(find.text('DESKTOP PREVIEW'), findsOneWidget);
      expect(find.text('MOBILE PREVIEW'), findsNothing);
      expect(find.text('Sponsored Ad'), findsOneWidget);
    },
  );

  testWidgets('cancel offers save-draft and discard actions', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(home: CampaignEditor.forType(CampaignTypeTab.photoVideo)),
    );
    await tester.pump();

    final cancelAction = find.byKey(const Key('campaign-cancel'));
    await tester.dragUntilVisible(
      cancelAction,
      find.byType(ListView).first,
      const Offset(0, -500),
    );
    await tester.ensureVisible(cancelAction);
    await tester.pumpAndSettle();
    await tester.tap(cancelAction);
    await tester.pumpAndSettle();

    expect(find.text('CANCEL AD'), findsOneWidget);
    expect(find.text('SAVE DRAFT'), findsOneWidget);
    expect(find.text('DISCARD'), findsOneWidget);
  });
}
