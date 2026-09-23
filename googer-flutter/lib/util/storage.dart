// Tiny persistent key-value store.
// Web → window.localStorage (same place the web app keeps its token);
// non-web builds fall back to an in-memory map (no persistence yet).
export 'storage_stub.dart' if (dart.library.html) 'storage_web.dart';
