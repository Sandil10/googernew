import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/util/storage.dart';

void main() {
  test('login device payload includes stable mobile device metadata', () {
    writeStorage('googer-device-id', 'mobile-test-device');

    final payload = Api.buildLoginDevicePayload();

    expect(payload['deviceId'], 'mobile-test-device');
    expect(payload['client'], startsWith('flutter-'));
    expect(payload['timezone'], isA<String>());
    expect(payload['timezoneOffsetMinutes'], isA<int>());
  });

  test('approval-required response maps to the same polling signal as web', () {
    final signal = Api.deviceApprovalSignalFromResponse({
      'approvalRequired': true,
      'message': 'A new device is trying to access your account.',
      'approval': {
        'id': 'approval-123',
        'token': 'approval-token',
        'expiresInSeconds': 300,
      },
    });

    expect(
      signal,
      'APPROVAL_REQUIRED|approval-123|approval-token|A new device is trying to access your account.',
    );
  });

  test('login OTP response preserves message and debug OTP', () {
    final signal = Api.loginOtpSignalFromResponse({
      'otpRequired': true,
      'message': 'OTP sent to registered email.',
      'debugOtp': '123456',
    });

    expect(signal, 'OTP_REQUIRED|OTP sent to registered email. (OTP: 123456)');
  });
}
