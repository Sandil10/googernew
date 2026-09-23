bool subscriptionLimitReached(num? count, num? limit) {
  return count != null && limit != null && limit > 0 && count >= limit;
}

bool subscriptionTextLimitExceeded(int length, int limit) {
  return limit > 0 && length > limit;
}

double subscriptionContentLimit(
  Map<String, dynamic> extra,
  String key, {
  required bool isBasic,
}) {
  final fallback = switch (key) {
    'content_upload_limit' => isBasic ? 5.0 : 15.0,
    'content_daily_upload_limit' => isBasic ? 1.0 : 3.0,
    'content_video_limit_minutes' => isBasic ? 1.0 : 5.0,
    _ => 0.0,
  };
  return double.tryParse('${extra[key] ?? ''}') ?? fallback;
}
