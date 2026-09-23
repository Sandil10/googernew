import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/widgets/share_sheet.dart';

void main() {
  testWidgets('legacy share sheet uses web share-and-earn layout', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final previousUser = Api.user;
    Api.user = {'id': 77, 'user_id': '312495', 'username': 'hee'};
    addTearDown(() => Api.user = previousUser);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showShareSheet(
                context,
                title: 'Comedy',
                subtitle: 'Comedy',
                url: 'https://googer.site/reel/5slqqwkw',
                linkLabel: 'Reel Link',
                canEarn: true,
                commission: '10',
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.text('Share'), findsOneWidget);
    expect(find.text('REEL LINK'), findsOneWidget);
    expect(find.text('Share & Earn'), findsOneWidget);
    await tester.tap(find.byKey(const Key('legacy-upload-share-earn')));
    await tester.pumpAndSettle();

    expect(find.text('BACK'), findsOneWidget);
    expect(find.text('SHARE COMMISSION'), findsOneWidget);
    expect(find.text('10% per eligible watch'), findsOneWidget);
    await tester.tap(find.text('Generate Share'));
    await tester.pump();

    expect(find.text('SHARE LINK READY'), findsOneWidget);
    expect(
      find.text('https://googer.site/reel/5slqqwkw/312495'),
      findsOneWidget,
    );
    expect(find.text('Copy Share Link'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
