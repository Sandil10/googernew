import 'profile_photo_picker_data.dart';
import 'profile_photo_picker_platform_stub.dart'
    if (dart.library.html) 'profile_photo_picker_platform_web.dart'
    as platform;

Future<PickedProfilePhoto?> pickWebProfilePhoto({
  required bool camera,
  required bool filesOnly,
}) => platform.pickWebProfilePhoto(camera: camera, filesOnly: filesOnly);
