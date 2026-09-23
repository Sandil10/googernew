import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';

/// `GET /chat/conversations` returns flat `participant_*` columns
/// (chatController.js:1226). Reading the wrong keys is silent — every row just
/// falls back to a placeholder avatar — so the mapping is worth pinning down.
void main() {
  test('support threads are filtered out by role', () {
    expect(
      Api.debugIsSupportConversation({
        'participant_role': 'superadmin',
        'participant_display_name': 'Googer Support',
      }),
      isTrue,
    );
    expect(
      Api.debugIsSupportConversation({'participant_role': 'super_admin'}),
      isTrue,
      reason: 'the underscored spelling is used in the schema too',
    );
    expect(
      Api.debugIsSupportConversation({
        'participant_display_name': 'Googer Support',
      }),
      isTrue,
      reason: 'fall back to the label when the role is absent',
    );
  });

  test('ordinary and admin peers are kept', () {
    expect(
      Api.debugIsSupportConversation({
        'participant_role': 'user',
        'participant_display_name': '001',
      }),
      isFalse,
    );
    expect(
      Api.debugIsSupportConversation({
        'participant_role': 'admin',
        'participant_display_name': 'superadmin',
      }),
      isFalse,
      reason: 'plain admins are real conversations, only super admins are hidden',
    );
    expect(Api.debugIsSupportConversation(const {}), isFalse);
  });

  group('conversation title never shows a raw identifier', () {
    test('a bare number falls back to the username', () {
      expect(Api.debugConversationTitle('837', 'oh1'), 'oh1');
      expect(Api.debugConversationTitle('#837', 'oh1'), 'oh1');
    });

    test('an "id"-shaped value falls back too', () {
      expect(Api.debugConversationTitle('id', 'oh1'), 'oh1');
      expect(Api.debugConversationTitle('ID 837', 'oh1'), 'oh1');
      expect(Api.debugConversationTitle('id_837', 'oh1'), 'oh1');
    });

    test('empty falls back, and a placeholder username is replaced', () {
      expect(Api.debugConversationTitle('', 'oh1'), 'oh1');
      expect(Api.debugConversationTitle('837', 'user'), 'Googer user');
      expect(Api.debugConversationTitle('', ''), 'Googer user');
    });

    test('real names are untouched', () {
      expect(Api.debugConversationTitle('001', 'oh1'), 'oh1',
          reason: 'a purely numeric name is indistinguishable from an id');
      expect(Api.debugConversationTitle('He Fernando', 'hee'), 'He Fernando');
      expect(Api.debugConversationTitle('superadmin', 'sa'), 'superadmin');
    });
  });

  group('last_message arrives as an object, not a string', () {
    test('an object is unpacked instead of stringified', () {
      final (type, text, sender) = Api.debugLastMessageOf({
        'last_message': {
          'id': 837,
          'sender_id': 4,
          'receiver_id': 21,
          'type': 'voice',
          'text': 'hello',
        },
      });
      expect(type, 'voice');
      expect(text, 'hello');
      expect(sender, '4');
    });

    test('the raw object never leaks into the preview', () {
      final (type, text, _) = Api.debugLastMessageOf({
        'last_message': {'id': 837, 'sender_id': 4, 'type': 'voice'},
      });
      final preview = Api.debugConversationPreview(type, text);
      expect(preview, 'Voice message');
      expect(preview, isNot(contains('837')));
      expect(preview, isNot(contains('sender_id')));
    });

    test('a plain string still works', () {
      final (type, text, _) = Api.debugLastMessageOf({
        'last_message': 'hi there',
        'message_type': 'text',
      });
      expect(type, 'text');
      expect(text, 'hi there');
    });

    test('support rows are filtered when the peer is nested', () {
      expect(
        Api.debugIsSupportConversation({
          'participant': {'full_name': 'Googer Support', 'user_type': 'user'},
        }),
        isTrue,
      );
      expect(
        Api.debugIsSupportConversation({
          'user': {'user_type': 'super_admin'},
        }),
        isTrue,
      );
    });
  });

  group('conversation preview', () {
    test('media types are described, not dumped', () {
      expect(Api.debugConversationPreview('voice', 'data:audio/webm;base64,AA'),
          'Voice message');
      expect(Api.debugConversationPreview('sticker', 'https://x/y.gif'),
          'Sticker');
      expect(Api.debugConversationPreview('image', ''), 'Photo');
    });

    test('a data URL never leaks into the preview', () {
      expect(Api.debugConversationPreview('', 'data:image/png;base64,AAAA'),
          'Attachment');
    });

    test('colour markup is stripped', () {
      expect(Api.debugConversationPreview('text', '[c=#ef4444]hi[/c]'), 'hi');
    });

    test('plain text passes through', () {
      expect(Api.debugConversationPreview('text', 'hello there'),
          'hello there');
    });
  });
}
