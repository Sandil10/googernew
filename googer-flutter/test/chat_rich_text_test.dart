import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/util/chat_rich_text.dart';

/// The `[c=…]…[/c]` encoding is a wire contract shared with the web client —
/// if these drift, colours silently break in one direction only.
void main() {
  const base = TextStyle(fontSize: 12, color: Colors.white);

  test('plain text yields a single span', () {
    final spans = ChatRichText.spans('hello', baseStyle: base);
    expect(spans.length, 1);
    expect(spans.first.text, 'hello');
    expect(spans.first.style?.color, Colors.white);
  });

  test('hex tags colour their run', () {
    final spans = ChatRichText.spans('[c=#ef4444]hi[/c]', baseStyle: base);
    expect(spans.length, 1);
    expect(spans.first.text, 'hi');
    expect(spans.first.style?.color, const Color(0xFFEF4444));
  });

  test('named colours resolve from the shared table', () {
    final spans = ChatRichText.spans('[c=green]go[/c]', baseStyle: base);
    expect(spans.first.style?.color, const Color(0xFF22C55E));
  });

  test('three-digit hex expands', () {
    final spans = ChatRichText.spans('[c=#f00]x[/c]', baseStyle: base);
    expect(spans.first.style?.color, const Color(0xFFFF0000));
  });

  test('text around a tag keeps the base style', () {
    final spans = ChatRichText.spans('a [c=blue]b[/c] c', baseStyle: base);
    expect(spans.map((s) => s.text).join(), 'a b c');
    expect(spans[0].style?.color, Colors.white);
    expect(spans[1].style?.color, const Color(0xFF3B82F6));
    expect(spans[2].style?.color, Colors.white);
  });

  test('an unsafe colour renders verbatim rather than being dropped', () {
    const raw = '[c=url(evil)]x[/c]';
    final spans = ChatRichText.spans(raw, baseStyle: base);
    expect(spans.map((s) => s.text).join(), raw);
    expect(spans.first.style?.color, Colors.white);
  });

  test('wrap round-trips through spans', () {
    final wrapped = ChatRichText.wrap('hey', const Color(0xFF22C55E));
    expect(wrapped, '[c=#22c55e]hey[/c]');
    final spans = ChatRichText.spans(wrapped, baseStyle: base);
    expect(spans.first.text, 'hey');
    expect(spans.first.style?.color, const Color(0xFF22C55E));
  });

  test('wrap leaves empty text alone', () {
    expect(ChatRichText.wrap('', Colors.red), '');
  });

  test('stripTags gives clipboard-safe text', () {
    expect(ChatRichText.stripTags('a [c=red]b[/c] c'), 'a b c');
    expect(ChatRichText.stripTags('no tags'), 'no tags');
  });
}
