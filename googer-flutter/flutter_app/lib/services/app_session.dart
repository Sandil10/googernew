import 'package:flutter/widgets.dart';

import 'googer_api.dart';

class AppSession extends ChangeNotifier {
  AppSession({GoogerApi? api}) : api = api ?? GoogerApi() {
    controller = SessionController(this.api);
  }

  final GoogerApi api;
  late final SessionController controller;
  bool restoring = true;

  bool get isAuthenticated => controller.isAuthenticated;
  Map<String, dynamic>? get user => controller.user;

  Future<void> restore() async {
    restoring = true;
    notifyListeners();
    await controller.restore();
    restoring = false;
    notifyListeners();
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final result = await controller.login(email, password);
    notifyListeners();
    return result;
  }

  Future<Map<String, dynamic>> verifyLoginOtp({
    required String email,
    required String password,
    required String otp,
  }) async {
    final result = await controller.verifyLoginOtp(email: email, password: password, otp: otp);
    notifyListeners();
    return result;
  }

  Future<Map<String, dynamic>> pollDeviceApproval(String id, String token) async {
    final result = await controller.pollDeviceApproval(id, token);
    notifyListeners();
    return result;
  }

  Future<void> logout() async {
    await controller.logout();
    notifyListeners();
  }
}

class SessionScope extends InheritedNotifier<AppSession> {
  const SessionScope({
    super.key,
    required AppSession session,
    required super.child,
  }) : super(notifier: session);

  static AppSession of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SessionScope>();
    assert(scope != null, 'SessionScope was not found in the widget tree.');
    return scope!.notifier!;
  }
}
