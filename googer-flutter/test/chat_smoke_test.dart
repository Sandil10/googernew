import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/chat_dm_screen.dart';
import 'package:ionicons/ionicons.dart';

/// The thread screen gained a custom header, a selection bar and three
/// composer panels, all of which lay out in tight horizontal rows — exactly
/// where narrow phones break.
void main() {
  for (final size in const [Size(430, 900), Size(360, 780)]) {
    testWidgets('thread renders at ${size.width}x${size.height}', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        const MaterialApp(
          home: ChatDmScreen(
            peerId: 1,
            name: '001',
            username: 'oh1',
            avatar: '',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));

      expect(tester.takeException(), isNull);
      expect(find.text('001'), findsWidgets);
      // Video quality belongs to Package 3 and stays hidden when the feature
      // endpoint does not grant video calls.
      expect(find.text('240P'), findsNothing);
      expect(find.text('360P'), findsNothing);
      expect(find.text('OFFLINE'), findsOneWidget);
    });
  }

  testWidgets('call-quality controls stay hidden without video-call access', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(
        home: ChatDmScreen(peerId: 1, name: '001', username: 'oh1', avatar: ''),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('240P'), findsNothing);
    expect(find.text('360P'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('composer swaps voice controls for send when text is entered', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(
        home: ChatDmScreen(peerId: 1, name: 'hee', username: 'hee', avatar: ''),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byIcon(Ionicons.mic_outline), findsOneWidget);
    expect(find.byIcon(Ionicons.send), findsNothing);

    await tester.enterText(find.byType(TextField), 'hello');
    await tester.pump();

    expect(find.byIcon(Ionicons.send), findsOneWidget);
    expect(find.byIcon(Ionicons.mic_outline), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
