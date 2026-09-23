import 'profile_photo_picker_data.dart';

Future<PickedProfilePhoto?> pickWebProfilePhoto({
  required bool camera,
  required bool filesOnly,
}) {
  throw UnsupportedError('The browser photo picker is only available on web.');
}
