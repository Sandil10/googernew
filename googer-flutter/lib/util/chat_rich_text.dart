import 'package:flutter/material.dart';

/// Port of the web `ChatRichText`.
///
/// Message colour is **not** a separate API field — the web encodes it inline
/// in the message body as BBCode-style `[c=COLOR]text[/c]`
/// (`app/components/chat/ChatRichText.tsx`). Both ends must agree on that, so
/// this mirrors the same parser, the same named-colour table, and the same
/// "unknown tags render verbatim" rule.
class ChatRichText {
  ChatRichText._();

  /// Named colours the web accepts. Anything else must be a hex literal.
  static const namedColors = <String, Color>{
    'red': Color(0xFFEF4444),
    'orange': Color(0xFFF97316),
    'yellow': Color(0xFFEAB308),
    'green': Color(0xFF22C55E),
    'teal': Color(0xFF14B8A6),
    'blue': Color(0xFF3B82F6),
    'indigo': Color(0xFF6366F1),
    'purple': Color(0xFFA855F7),
    'pink': Color(0xFFEC4899),
    'white': Color(0xFFFFFFFF),
    'gray': Color(0xFF9CA3AF),
    'black': Color(0xFF000000),
  };

  static final _tag = RegExp(r'\[c=([^\]]+)\]([\s\S]*?)\[/c\]');
  static final _hex = RegExp(r'^#([0-9a-f]{3}|[0-9a-f]{6})$');

  /// Resolves a tag value to a colour, or null when it is neither a known name
  /// nor a hex literal — the web refuses anything else so user input cannot
  /// inject arbitrary styling.
  static Color? safeColor(String raw) {
    final value = raw.trim().toLowerCase();
    final named = namedColors[value];
    if (named != null) return named;
    if (!_hex.hasMatch(value)) return null;
    var digits = value.substring(1);
    if (digits.length == 3) {
      digits = digits.split('').map((c) => '$c$c').join();
    }
    return Color(int.parse('ff$digits', radix: 16));
  }

  /// Splits `text` into spans, colouring `[c=…]…[/c]` runs. Text with no tags
  /// comes back as a single span.
  static List<TextSpan> spans(String text, {required TextStyle baseStyle}) {
    if (!text.contains('[c=') && !text.contains('[/c]')) {
      return [TextSpan(text: text, style: baseStyle)];
    }

    final out = <TextSpan>[];
    var cursor = 0;
    for (final match in _tag.allMatches(text)) {
      if (match.start > cursor) {
        out.add(
          TextSpan(text: text.substring(cursor, match.start), style: baseStyle),
        );
      }
      final color = safeColor(match.group(1) ?? '');
      if (color == null) {
        // Unknown tag — render it verbatim so the message is never lost.
        out.add(TextSpan(text: match.group(0), style: baseStyle));
      } else {
        out.add(
          TextSpan(
            text: match.group(2),
            style: baseStyle.copyWith(color: color),
          ),
        );
      }
      cursor = match.end;
    }
    if (cursor < text.length) {
      out.add(TextSpan(text: text.substring(cursor), style: baseStyle));
    }
    return out;
  }

  /// Strips colour tags — used for previews and clipboard copies, where the
  /// markup would otherwise leak into plain text.
  static String stripTags(String text) {
    if (!text.contains('[c=')) return text;
    return text.replaceAllMapped(_tag, (m) => m.group(2) ?? '');
  }

  static String hexOf(Color color) =>
      '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';

  /// Wraps outgoing text in a colour tag, matching `wrapWithColorTag`.
  static String wrap(String text, Color color) =>
      text.isEmpty ? text : '[c=${hexOf(color)}]$text[/c]';
}
