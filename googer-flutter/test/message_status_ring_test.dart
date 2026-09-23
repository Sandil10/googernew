import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/widgets/message_status_ring.dart';

/// The web resolves status by precedence, not by the stored column alone
/// (`resolveMessageStatus`, chats/page.tsx:655) — a read message may still
/// carry status "sent", so the timestamps have to win.
void main() {
  test('read_at wins over everything', () {
    expect(
      MessageStatusRing.resolve({
        'read_at': '2026-08-01T10:00:00Z',
        'delivered_at': '2026-08-01T09:00:00Z',
        'status': 'sent',
      }),
      'read',
    );
  });

  test('delivered_at wins over the stored status', () {
    expect(
      MessageStatusRing.resolve({
        'delivered_at': '2026-08-01T09:00:00Z',
        'status': 'sent',
      }),
      'delivered',
    );
  });

  test('falls back to the stored status', () {
    expect(MessageStatusRing.resolve({'status': 'sending'}), 'sending');
  });

  test('defaults to sent when nothing is known', () {
    expect(MessageStatusRing.resolve(const {}), 'sent');
    expect(MessageStatusRing.resolve({'status': ''}), 'sent');
  });

  test('empty timestamps are not treated as set', () {
    expect(
      MessageStatusRing.resolve({'read_at': '', 'delivered_at': ''}),
      'sent',
    );
  });

  test('camelCase keys are accepted too', () {
    expect(
      MessageStatusRing.resolve({'readAt': '2026-08-01T10:00:00Z'}),
      'read',
    );
  });

  test('labels match the web tooltips', () {
    expect(MessageStatusRing.labelFor('sending'), 'Sending');
    expect(MessageStatusRing.labelFor('delivered'), 'Delivered');
    expect(MessageStatusRing.labelFor('read'), 'Read');
    expect(MessageStatusRing.labelFor('sent'), 'Sent');
  });
}
