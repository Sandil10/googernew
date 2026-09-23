import 'package:flutter/foundation.dart';

class HomeFeedRefreshBus {
  HomeFeedRefreshBus._();

  static final ValueNotifier<int> signal = ValueNotifier<int>(0);

  static void requestRefresh() {
    signal.value++;
  }
}
