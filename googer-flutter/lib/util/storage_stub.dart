final Map<String, String> _mem = {};

String? readStorage(String key) => _mem[key];

void writeStorage(String key, String? value) {
  if (value == null) {
    _mem.remove(key);
  } else {
    _mem[key] = value;
  }
}
