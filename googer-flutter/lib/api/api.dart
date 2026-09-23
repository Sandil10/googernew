import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/foundation.dart'
    show ValueNotifier, kIsWeb, visibleForTesting;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../data/mock.dart';
import '../services/token_store.dart';
import '../util/ad_countries.dart';
import '../util/storage.dart';
import '../widgets/message_status_ring.dart';

class ApiUploadFile {
  final String field;
  final String filename;
  final Uint8List bytes;
  final String? contentType;

  const ApiUploadFile({
    required this.field,
    required this.filename,
    required this.bytes,
    this.contentType,
  });

  ApiUploadFile withField(String nextField) => ApiUploadFile(
    field: nextField,
    filename: filename,
    bytes: bytes,
    contentType: contentType,
  );
}

/// Real Googer backend client (same Express API the Next.js web app uses).
/// - Web preview: same-origin /api (served from expo.googer.site — no CORS)
/// - Native builds: https://expo.googer.site/api (proxies /api → backend)
/// Real data only: failed requests return empty states/errors instead of seeded
/// demo records, so the mobile app reflects the same backend as the web app.
/// Override the host at build time with --dart-define=GOOGER_API_BASE=...
class Api {
  static const String _baseOverride = String.fromEnvironment("GOOGER_API_BASE");
  static String get base {
    if (_baseOverride.isNotEmpty) {
      return _baseOverride.replaceFirst(RegExp(r"/+$"), "");
    }
    return kIsWeb ? "" : "https://expo.googer.site";
  }

  static String? token;
  static Map<String, dynamic>? user;
  static final ValueNotifier<int> profileRevision = ValueNotifier<int>(0);
  static int _avatarRevision = 0;

  static bool get loggedIn => token != null;

  static String getOrCreateDeviceId() {
    const key = "googer-device-id";
    var value = readStorage(key);
    if (value != null && value.trim().isNotEmpty) return value.trim();
    late final Random random;
    try {
      random = Random.secure();
    } catch (_) {
      random = Random();
    }
    final suffix = List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, "0"),
    ).join();
    value = "mobile-${DateTime.now().millisecondsSinceEpoch}-$suffix";
    writeStorage(key, value);
    return value;
  }

  @visibleForTesting
  static Map<String, dynamic> buildLoginDevicePayload() {
    final now = DateTime.now();
    return {
      "deviceId": getOrCreateDeviceId(),
      "timezone": now.timeZoneName,
      "timezoneOffsetMinutes": now.timeZoneOffset.inMinutes,
      "client": kIsWeb ? "flutter-web" : "flutter-mobile",
    };
  }

  static Map<String, dynamic> _loginRequestBody(Map<String, dynamic> payload) =>
      {...payload, ...buildLoginDevicePayload()};

  @visibleForTesting
  static String? deviceApprovalSignalFromResponse(dynamic data) {
    if (data is! Map ||
        data["approvalRequired"] != true ||
        data["approval"] is! Map) {
      return null;
    }
    final approval = Map<String, dynamic>.from(data["approval"] as Map);
    final id = "${approval["id"] ?? ""}";
    final approvalToken = "${approval["token"] ?? ""}";
    final message =
        (data["message"] ?? "A trusted device must approve this login request.")
            .toString();
    if (id.isEmpty || approvalToken.isEmpty) return message;
    return "APPROVAL_REQUIRED|$id|$approvalToken|$message";
  }

  @visibleForTesting
  static String? loginOtpSignalFromResponse(dynamic data) {
    if (data is! Map || data["otpRequired"] != true) return null;
    final message = (data["message"] ?? "OTP sent to registered email")
        .toString();
    final debugOtp = data["debugOtp"]?.toString();
    return "OTP_REQUIRED|$message${debugOtp == null || debugOtp.isEmpty ? "" : " (OTP: $debugOtp)"}";
  }

  /// Restore the saved session (called once from main() before runApp).
  /// The web app keeps its token across reloads — the Flutter build must too,
  /// otherwise every refresh silently logs the user out.
  ///
  /// Two stores have to agree: the raw web-style keys this client writes and
  /// the `shared_preferences` copy [TokenStore] owns. Whichever still holds a
  /// token wins and both are rewritten, so a session created through either
  /// path survives a reload.
  ///
  /// The restored session is then validated, but a slow or unreachable backend
  /// must never read as a logout — on timeout the stored session is kept.
  static Future<void> init() async {
    final rawToken = readStorage("token") ?? readStorage("googer_token");
    final prefsToken = await TokenStore.get();
    token = (rawToken != null && rawToken.isNotEmpty) ? rawToken : prefsToken;

    final saved = readStorage("googer_user");
    if (saved != null && saved.isNotEmpty) {
      try {
        user = _unwrapUser(jsonDecode(saved));
      } catch (_) {}
    }
    if (loggedIn) {
      _persistAuth();
      try {
        await refreshProfile().timeout(const Duration(seconds: 6));
      } on TimeoutException {
        // Offline or backend still waking up — stay signed in with what we have.
      }
    }
  }

  static void _persistAuth() {
    writeStorage("googer_token", token);
    writeStorage("token", token);
    writeStorage("googer_user", user == null ? null : jsonEncode(user));
    // Mirror into shared_preferences so both session stores stay in step —
    // otherwise a login through one path is invisible to the other on reload.
    final current = token;
    unawaited(
      current == null || current.isEmpty
          ? TokenStore.clear()
          : TokenStore.set(current),
    );
  }

  static String get displayName =>
      (user?["full_name"] ?? user?["username"] ?? "Googer User").toString();
  static String get username => (user?["username"] ?? "googer").toString();
  static String get email => (user?["email"] ?? "").toString();
  static String get googerId =>
      (user?["user_id"] ?? user?["googer_id"] ?? "").toString();
  static String get currentUserId =>
      (user?["id"] ??
              user?["userId"] ??
              user?["user_id"] ??
              user?["googer_id"] ??
              "")
          .toString();
  static Set<String> get currentUserIds {
    final ids = <String>{};
    for (final key in const ["id", "userId", "user_id", "googer_id"]) {
      final value = user?[key];
      if (value != null && "$value".trim().isNotEmpty && "$value" != "null") {
        ids.add("$value".trim());
      }
    }
    return ids;
  }

  static double get balance =>
      double.tryParse(
        "${user?["wallet_balance"] ?? user?["walletBalance"] ?? ""}",
      ) ??
      0;
  static String? get avatar {
    final pic = rawAvatar(user);
    if (pic == null || pic.isEmpty) return null;
    return _withAvatarRevision(resolveAvatar(pic));
  }

  static String _withAvatarRevision(String url) {
    if (_avatarRevision <= 0 || url.startsWith('data:')) return url;
    final separator = url.contains('?') ? '&' : '?';
    return '$url${separator}av=$_avatarRevision';
  }

  /// "2h" / "4 D" style relative timestamps (web formatRelativeTime parity).
  /// Parses a backend timestamp into device-local time.
  ///
  /// Postgres values can arrive without a timezone marker
  /// ("2026-07-28 03:20:14"). `DateTime.parse` reads those as *local* time,
  /// which shifted every comment by the device's UTC offset — 5h30m in Sri
  /// Lanka. Anything without an explicit zone is therefore treated as UTC,
  /// which is what the database actually stores.
  static DateTime? parseServerTime(dynamic value) {
    final raw = "${value ?? ''}".trim();
    if (raw.isEmpty) return null;
    final hasZone = RegExp(r"(?:Z|z|[+-]\d{2}:?\d{2})$").hasMatch(raw);
    if (hasZone) return DateTime.tryParse(raw)?.toLocal();
    final asUtc = DateTime.tryParse("${raw.replaceFirst(' ', 'T')}Z");
    return (asUtc ?? DateTime.tryParse(raw))?.toLocal();
  }

  static String relativeTime(dynamic iso) {
    final parsed = parseServerTime(iso);
    if (parsed == null) return "$iso".split("T").first;
    final diff = DateTime.now().difference(parsed);
    // Small clock differences between server and device must not read as
    // "in the future".
    if (diff.isNegative) return "now";
    if (diff.inMinutes < 1) return "now";
    if (diff.inMinutes < 60) return "${diff.inMinutes}m";
    if (diff.inHours < 24) return "${diff.inHours}h";
    if (diff.inDays < 7) return "${diff.inDays}d";
    if (diff.inDays < 30) return "${(diff.inDays / 7).floor()}w";
    if (diff.inDays < 365) return "${(diff.inDays / 30).floor()} mo";
    return "${(diff.inDays / 365).floor()}y";
  }

  static const List<String> _monthAbbr = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  /// The calendar day something was posted, in the app's month-first style:
  /// "Jul 25" within the last year, "Jul 25, 2025" once it is older — at that
  /// distance the day and month alone are ambiguous.
  static String postedDate(dynamic iso) {
    final parsed = parseServerTime(iso);
    if (parsed == null) return "$iso".split("T").first;
    final month = _monthAbbr[parsed.month - 1];
    final now = DateTime.now();
    final overAYearOld = now.difference(parsed).inDays >= 365;
    if (overAYearOld || parsed.year != now.year) {
      return "$month ${parsed.day}, ${parsed.year}";
    }
    return "$month ${parsed.day}";
  }

  /// Age label for comments. A relative age ("now", "51m", "3d") only stays
  /// meaningful for about a week — past that "9w" tells the reader nothing, so
  /// we switch to the date the comment was actually posted.
  static String commentTime(dynamic iso) {
    final parsed = parseServerTime(iso);
    if (parsed == null) return "$iso".split("T").first;
    final diff = DateTime.now().difference(parsed);
    if (!diff.isNegative && diff.inDays >= 7) return postedDate(iso);
    return relativeTime(iso);
  }

  /// Resolve backend media paths ("uploads/x.jpg", "/uploads/x.jpg", full URLs, data URIs)
  static String resolveMedia(String src) {
    if (src.trim().isEmpty) return "";
    if (src.startsWith("http") || src.startsWith("data:")) return src;
    final normalized = src.replaceAll("\\", "/");
    // Preserve any absolute site path the backend already returned, not just
    // /uploads. Some default avatars live under /assets/... and must stay
    // there to match the web app.
    if (normalized.startsWith("/")) return "$base$normalized";
    if (normalized.startsWith("uploads/") || normalized.startsWith("assets/")) {
      return "$base/$normalized";
    }
    final file = normalized.split("/").last;
    return "$base/uploads/$file";
  }

  /// Web-profile-equivalent avatar resolution:
  /// - keep `http(s)` and `data:`
  /// - keep `/assets/...` as-is
  /// - keep `/uploads/...` as-is
  /// - every other relative/absolute avatar path collapses to `/uploads/<file>`
  static String resolveAvatar(String src) {
    final raw = src.trim();
    if (raw.isEmpty) return "";
    if (raw.startsWith("http") || raw.startsWith("data:")) return raw;
    final normalized = raw.replaceAll("\\", "/");
    if (normalized.startsWith("/assets/")) return "$base$normalized";
    if (normalized.startsWith("assets/")) return "$base/$normalized";
    if (normalized.startsWith("/uploads/")) return "$base$normalized";
    final file = normalized.split("/").last;
    return file.isEmpty ? "" : "$base/uploads/$file";
  }

  static Uint8List? decodeDataUri(String value) {
    final trimmed = value.trim();
    final comma = trimmed.indexOf(',');
    if (!trimmed.startsWith('data:') || comma < 0) return null;
    try {
      return base64Decode(trimmed.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }

  static String? _currentToken() {
    token = readStorage("token") ?? readStorage("googer_token") ?? token;
    return token;
  }

  static Map<String, String> _headers() {
    final authToken = _currentToken();
    return {
      "Content-Type": "application/json",
      if (authToken != null) "Authorization": "Bearer $authToken",
    };
  }

  static Future<dynamic> _get(String path) async {
    final res = await http
        .get(Uri.parse("$base/api$path"), headers: _headers())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final res = await http
        .post(
          Uri.parse("$base/api$path"),
          headers: _headers(),
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _put(String path, Map<String, dynamic> body) async {
    final res = await http
        .put(
          Uri.parse("$base/api$path"),
          headers: _headers(),
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _patch(String path, Map<String, dynamic> body) async {
    final res = await http
        .patch(
          Uri.parse("$base/api$path"),
          headers: _headers(),
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _delete(String path) async {
    final res = await http
        .delete(Uri.parse("$base/api$path"), headers: _headers())
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  /// DELETE with a JSON body — required by `DELETE /chat/messages`,
  /// which takes {messageIds, mode}.
  static Future<dynamic> _deleteBody(
    String path,
    Map<String, dynamic> body,
  ) async {
    final res = await http
        .delete(
          Uri.parse("$base/api$path"),
          headers: _headers(),
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static String _multipartValue(dynamic value) {
    if (value is String) return value;
    if (value is num || value is bool) return "$value";
    return jsonEncode(value);
  }

  static Future<dynamic> _multipart(
    String method,
    String path,
    Map<String, dynamic> fields,
    List<ApiUploadFile> files, {
    void Function(double progress)? onProgress,
  }) async {
    final req = http.MultipartRequest(method, Uri.parse("$base/api$path"));
    final authToken = _currentToken();
    if (authToken != null) req.headers["Authorization"] = "Bearer $authToken";
    fields.forEach((key, value) {
      if (value != null) req.fields[key] = _multipartValue(value);
    });
    for (final file in files) {
      req.files.add(
        http.MultipartFile.fromBytes(
          file.field,
          file.bytes,
          filename: file.filename,
          contentType: file.contentType == null
              ? null
              : MediaType.parse(file.contentType!),
        ),
      );
    }
    if (onProgress == null) {
      final streamed = await req.send().timeout(const Duration(seconds: 60));
      final body = await streamed.stream.bytesToString();
      if (streamed.statusCode >= 400) {
        throw ApiError(
          streamed.statusCode,
          _msgBody(streamed.statusCode, body),
        );
      }
      return body.isEmpty ? null : jsonDecode(body);
    }

    // MultipartRequest does not expose outgoing progress. Forward its finalized
    // byte stream through a StreamedRequest so the UI receives real byte counts.
    final source = req.finalize();
    final upload = http.StreamedRequest(method, req.url)
      ..headers.addAll(req.headers)
      ..contentLength = req.contentLength;
    final client = http.Client();
    try {
      final responseFuture = client
          .send(upload)
          .timeout(const Duration(minutes: 6));
      var sent = 0;
      final total = req.contentLength;
      onProgress(0);
      await for (final chunk in source) {
        upload.sink.add(chunk);
        sent += chunk.length;
        // Match the web XHR flow: upload bytes may advance only to 99%.
        // 100% means the server has accepted and returned the saved content.
        if (total > 0) {
          onProgress((sent / total).clamp(0.0, 0.99).toDouble());
        }
      }
      await upload.sink.close();
      final streamed = await responseFuture;
      final responseBody = await streamed.stream.bytesToString();
      if (streamed.statusCode >= 400) {
        throw ApiError(
          streamed.statusCode,
          _msgBody(streamed.statusCode, responseBody),
        );
      }
      onProgress(1);
      return responseBody.isEmpty ? null : jsonDecode(responseBody);
    } finally {
      client.close();
    }
  }

  static String _msg(http.Response res) {
    try {
      final data = jsonDecode(res.body);
      return (data["message"] ??
              data["error"] ??
              "Request failed (${res.statusCode})")
          .toString();
    } catch (_) {
      return "Request failed (${res.statusCode})";
    }
  }

  static String _msgBody(int statusCode, String body) {
    try {
      final data = jsonDecode(body);
      return (data["message"] ??
              data["error"] ??
              "Request failed ($statusCode)")
          .toString();
    } catch (_) {
      return "Request failed ($statusCode)";
    }
  }

  static Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is String && value.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    return null;
  }

  static Map<String, dynamic>? _unwrapUser(dynamic data) {
    final m = _asMap(data);
    if (m == null) return null;
    for (final key in ["user", "data", "profile"]) {
      final nested = _asMap(m[key]);
      if (nested != null) return _normalizeUser(nested);
    }
    if (m.containsKey("success") && m.length <= 2) return null;
    return _normalizeUser(m);
  }

  static Map<String, dynamic> _normalizeUser(Map<String, dynamic> userMap) {
    final normalized = Map<String, dynamic>.from(userMap);
    final avatarValue = rawAvatar(normalized);
    if (avatarValue != null && avatarValue.isNotEmpty) {
      normalized["profile_picture"] = avatarValue;
    }
    return normalized;
  }

  static String? rawAvatar(dynamic value) {
    String? read(dynamic source) {
      if (source == null) return null;
      if (source is String) {
        final trimmed = source.trim();
        return trimmed.isEmpty ? null : trimmed;
      }
      final map = _asMap(source);
      if (map == null) return null;
      for (final key in const [
        "profile_picture",
        "profilePicture",
        "profile_picture_url",
        "profilePictureUrl",
        "profile_image",
        "profileImage",
        "avatar",
        "avatar_url",
        "avatarUrl",
        "img",
        "image",
        "image_url",
        "imageUrl",
        "photo",
        "photo_url",
        "photoUrl",
        "picture",
        "display_profile_picture",
        "displayProfilePicture",
        "owner_profile_picture",
        "ownerProfilePicture",
        "sender_profile_picture",
        "senderProfilePicture",
        "participant_profile_picture",
        "participantProfilePicture",
        "participant_display_profile_picture",
        "participantDisplayProfilePicture",
      ]) {
        final nested = read(map[key]);
        if (nested != null && nested.isNotEmpty) return nested;
      }
      for (final key in const [
        "user",
        "profile",
        "owner",
        "participant",
        "sender",
        "receiver",
        "author",
      ]) {
        final nested = read(map[key]);
        if (nested != null && nested.isNotEmpty) return nested;
      }
      return null;
    }

    return read(value);
  }

  static List _unwrapList(dynamic data, List<String> keys) {
    if (data is List) return data;
    if (data is Map) {
      for (final key in keys) {
        final value = data[key];
        if (value is List) return value;
      }
    }
    return const [];
  }

  /* ── auth ── */

  static Future<String?> login(String emailIn, String password) async {
    try {
      final data = await _post(
        "/auth/login",
        _loginRequestBody({"email": emailIn, "password": password}),
      );
      final approvalSignal = deviceApprovalSignalFromResponse(data);
      if (approvalSignal != null) return approvalSignal;
      final otpSignal = loginOtpSignalFromResponse(data);
      if (otpSignal != null) return otpSignal;
      token = data?["token"]?.toString();
      user = _unwrapUser(data);
      if (token == null) {
        return (data?["message"] ?? "Unexpected response from server.")
            .toString();
      }
      _persistAuth();
      await refreshProfile();
      return null; // success
    } on ApiError catch (e) {
      return e.message; // wrong credentials etc.
    } catch (_) {
      return "Could not reach the server. Please try again.";
    }
  }

  static Future<String?> verifyLoginOtp(
    String emailIn,
    String password,
    String otp,
  ) async {
    try {
      final data = await _post(
        "/auth/login/verify-otp",
        _loginRequestBody({"email": emailIn, "password": password, "otp": otp}),
      );
      final approvalSignal = deviceApprovalSignalFromResponse(data);
      if (approvalSignal != null) return approvalSignal;
      token = data?["token"]?.toString();
      user = _unwrapUser(data);
      if (token == null) {
        return (data?["message"] ?? "Unexpected response from server.")
            .toString();
      }
      _persistAuth();
      await refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not verify OTP. Please try again.";
    }
  }

  static Future<String?> getDeviceApprovalStatus(
    String approvalId,
    String approvalToken,
  ) async {
    try {
      final data = await _post("/auth/login/device-approval/status", {
        "approvalId": approvalId,
        "approvalToken": approvalToken,
      });
      if (data is Map &&
          (data["token"] != null || "${data["status"]}" == "approved")) {
        token = data["token"]?.toString();
        user = _unwrapUser(data);
        if (token == null) return "Device approved, but login token missing.";
        _persistAuth();
        await refreshProfile();
        return null;
      }
      return (data?["message"] ?? "Waiting for a trusted device.").toString();
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not check device approval. Please try again.";
    }
  }

  static Future<String?> register(Map<String, dynamic> payload) async {
    try {
      final data = await _post("/auth/register", payload);
      token = data?["token"]?.toString();
      user = _unwrapUser(data);
      if (token != null) await refreshProfile();
      _persistAuth();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server. Please try again.";
    }
  }

  static Future<({String? error, String? debugOtp})> requestPasswordResetOtp(
    String emailIn,
  ) async {
    try {
      final data = await _post("/auth/forgot-password/request-otp", {
        "email": emailIn,
      });
      return (error: null, debugOtp: data?["debugOtp"]?.toString());
    } on ApiError catch (e) {
      return (error: e.message, debugOtp: null);
    } catch (_) {
      return (
        error: "Could not reach the server. Please try again.",
        debugOtp: null,
      );
    }
  }

  static Future<({String? error, String? resetToken})> verifyPasswordResetOtp(
    String emailIn,
    String otp,
  ) async {
    try {
      final data = await _post("/auth/forgot-password/verify-otp", {
        "email": emailIn,
        "otp": otp,
      });
      return (
        error: null,
        resetToken: (data?["resetToken"] ?? data?["reset_token"])?.toString(),
      );
    } on ApiError catch (e) {
      return (error: e.message, resetToken: null);
    } catch (_) {
      return (
        error: "Could not reach the server. Please try again.",
        resetToken: null,
      );
    }
  }

  static Future<String?> resetPasswordWithOtp(
    String emailIn,
    String resetToken,
    String newPassword,
  ) async {
    try {
      await _post("/auth/forgot-password/reset", {
        "email": emailIn,
        "resetToken": resetToken,
        "newPassword": newPassword,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server. Please try again.";
    }
  }

  static Future<void> refreshProfile() async {
    try {
      final previousPicture = user?["profile_picture"]?.toString() ?? "";
      final profile = _unwrapUser(await _get("/auth/profile"));
      if (profile != null) {
        user = profile;
        final nextPicture = user?["profile_picture"]?.toString() ?? "";
        if (nextPicture.isNotEmpty && nextPicture != previousPicture) {
          _avatarRevision++;
        }
        _persistAuth();
        profileRevision.value++;
      }
    } on ApiError catch (e) {
      // stored token no longer valid → drop the stale session
      if (e.status == 401 || e.status == 403) logout();
    } catch (_) {}
  }

  /// Ends the session everywhere — raw storage *and* [TokenStore], via
  /// [_persistAuth]. This is the only thing that should ever sign a user out;
  /// a reload or a failed request must not.
  /// Loads every value displayed by the wallet landing page without turning
  /// transport or backend failures into valid zero/empty values.
  static Future<Map<String, dynamic>> loadWalletDashboardRaw() async {
    if (!loggedIn) {
      throw ApiError(401, 'Please log in to view your wallet.');
    }

    try {
      final responses = await Future.wait<dynamic>([
        _get('/auth/profile'),
        _get('/wallet/history'),
        _get('/ads/my'),
        _get('/verification/status'),
        _get('/subscriptions/me'),
      ]);
      final profile = _unwrapUser(responses[0]);
      if (profile == null) {
        throw ApiError(502, 'The wallet profile response is invalid.');
      }

      final previousPicture = user?['profile_picture']?.toString() ?? '';
      user = profile;
      final nextPicture = user?['profile_picture']?.toString() ?? '';
      if (nextPicture.isNotEmpty && nextPicture != previousPicture) {
        _avatarRevision++;
      }
      _persistAuth();
      profileRevision.value++;

      return {
        'profile': profile,
        'history': responses[1],
        'ads': responses[2],
        'verification': responses[3],
        'subscription': responses[4],
      };
    } on ApiError catch (error) {
      if (error.status == 401) logout();
      rethrow;
    }
  }

  static void logout() {
    token = null;
    user = null;
    _persistAuth();
  }

  /* ── feed (googs) ── */

  static Future<List<GoogPost>> feed() async {
    try {
      final data = await _get("/googs");
      final list = _unwrapList(data, ["posts", "data", "googs", "items"]);
      return list
          .map<GoogPost>(
            (raw) => parseGoog(Map<String, dynamic>.from(raw as Map)),
          )
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Canonical web/backend home feed.
  ///
  /// The backend returns the final mixed order in `items[]`; callers should
  /// render that order directly and only fall back to legacy split endpoints if
  /// this endpoint is unavailable.
  static Future<List<Map<String, dynamic>>> homeFeedItemsRaw({
    int limit = 20,
    int offset = 0,
  }) async {
    final safeLimit = limit.clamp(1, 50);
    final safeOffset = offset < 0 ? 0 : offset;
    final data = await _get("/feed/home?limit=$safeLimit&offset=$safeOffset");
    final list = _unwrapList(data, ["items", "data"]);
    return list
        .whereType<Map>()
        .map((raw) => Map<String, dynamic>.from(raw))
        .toList(growable: false);
  }

  static GoogPost parseGoog(Map<String, dynamic> m) {
    final u = m["user"] is Map
        ? Map<String, dynamic>.from(m["user"])
        : <String, dynamic>{};
    int? parseColor(String? hex) {
      if (hex == null || !hex.startsWith("#")) return null;
      final v = int.tryParse(hex.substring(1), radix: 16);
      return v == null ? null : (hex.length == 7 ? 0xFF000000 | v : v);
    }

    return GoogPost(
      id: int.tryParse("${m["id"]}") ?? 0,
      userId:
          (u["id"] ??
                  u["user_id"] ??
                  u["userId"] ??
                  m["user_id"] ??
                  m["userId"] ??
                  m["owner_user_id"] ??
                  m["ownerUserId"] ??
                  "")
              .toString(),
      text: (m["text"] ?? m["content"] ?? "").toString(),
      textColor: parseColor(
        m["textColor"]?.toString() ?? m["text_color"]?.toString(),
      ),
      time: relativeTime(m["createdAt"] ?? m["created_at"] ?? ""),
      createdAt: (m["createdAt"] ?? m["created_at"] ?? "").toString(),
      username: (u["username"] ?? m["username"] ?? "googer").toString(),
      name: (u["full_name"] ?? u["name"] ?? m["full_name"] ?? "Googer User")
          .toString(),
      img: resolveAvatar(
        (u["profile_picture"] ??
                    u["profilePicture"] ??
                    u["profile_image"] ??
                    u["profileImage"] ??
                    u["img"] ??
                    u["avatar"] ??
                    m["profile_picture"] ??
                    m["profilePicture"] ??
                    m["profile_image"] ??
                    m["profileImage"] ??
                    m["owner_profile_picture"] ??
                    m["ownerProfilePicture"] ??
                    m["avatar"] ??
                    "")
                .toString()
                .isEmpty
            ? ""
            : (u["profile_picture"] ??
                      u["profilePicture"] ??
                      u["profile_image"] ??
                      u["profileImage"] ??
                      u["img"] ??
                      u["avatar"] ??
                      m["profile_picture"] ??
                      m["profilePicture"] ??
                      m["profile_image"] ??
                      m["profileImage"] ??
                      m["owner_profile_picture"] ??
                      m["ownerProfilePicture"] ??
                      m["avatar"])
                  .toString(),
      ),
      likes: int.tryParse("${m["likes"] ?? m["likes_count"] ?? 0}") ?? 0,
      comments:
          int.tryParse("${m["comments"] ?? m["comments_count"] ?? 0}") ?? 0,
      views: int.tryParse("${m["views"] ?? m["views_count"] ?? 0}") ?? 0,
      shares: int.tryParse("${m["shares"] ?? 0}") ?? 0,
      liked: m["user_liked"] == true || m["liked"] == true,
      saved: m["user_saved"] == true || m["saved"] == true,
      shareCode: (m["share_code"] ?? m["shareCode"] ?? "").toString(),
    );
  }

  /* ── home feed ads (same /ads/active-public + /market engagement
        endpoints the web home feed uses) ── */

  static Future<List<HomeAd>> activeAds({
    String shuffleSeed = "",
    String userId = "",
    bool filterForViewer = true,
  }) async {
    try {
      final ads = <HomeAd>[];
      int offset = 0;
      final userFilter = userId.trim().isEmpty
          ? ""
          : "&user_id=${Uri.encodeComponent(userId)}";
      for (int page = 0; page < 4; page++) {
        final data = await _get(
          "/ads/active-public?limit=50&offset=$offset$userFilter&shuffle=${Uri.encodeComponent(shuffleSeed)}",
        );
        final list = data?["ads"];
        if (list is! List || list.isEmpty) break;
        for (final raw in list) {
          if (raw is! Map) continue;
          final m = Map<String, dynamic>.from(raw);
          final status = (m["status"] ?? m["delivery_status"] ?? "Active")
              .toString()
              .toLowerCase();
          if (status != "active") continue;
          if (filterForViewer && !_canViewerSeeAd(m, user)) continue;
          ads.add(_parseHomeAd(m));
        }
        final pagination = data?["pagination"];
        final hasMore = pagination is Map && pagination["hasMore"] == true;
        if (!hasMore) break;
        offset =
            int.tryParse("${pagination["nextOffset"]}") ??
            (offset + list.length);
      }
      return ads;
    } catch (_) {
      return const [];
    }
  }

  /// Maps raw ad rows (e.g. from `/ads/my`) into the same [HomeAd] shape the
  /// feed uses, so any screen can render them with the shared ad card.
  static List<HomeAd> parseHomeAds(Iterable<Map<String, dynamic>> rows) =>
      rows.map(_parseHomeAd).toList(growable: false);

  @visibleForTesting
  static bool canViewerSeeAdForTesting(
    Map<String, dynamic> ad,
    Map<String, dynamic>? viewer,
  ) => _canViewerSeeAd(ad, viewer);

  /// Mirrors web `adVisibility.ts`. The backend returns the audience fields,
  /// while each client decides whether the signed-in viewer is eligible.
  static bool _canViewerSeeAd(
    Map<String, dynamic> ad,
    Map<String, dynamic>? viewer,
  ) {
    if (viewer == null) return true;
    final draft = _asMap(ad['editDraft'] ?? ad['edit_draft']) ?? {};

    Iterable<dynamic> values(dynamic value) {
      if (value is List) return value;
      if (value is String) {
        return value.split(',').map((part) => part.trim());
      }
      return value == null ? const [] : [value];
    }

    String locationToken(dynamic value) {
      if (value is! Map) return '$value';
      for (final key in const [
        'code',
        'countryCode',
        'country_code',
        'value',
        'label',
        'name',
        'country',
      ]) {
        final token = '${value[key] ?? ''}'.trim();
        if (token.isNotEmpty) return token;
      }
      return '';
    }

    final targets = <String>{};
    for (final source in [ad, draft]) {
      for (final key in const [
        'selectedLocationCodes',
        'selected_location_codes',
        'locationCodes',
        'location_codes',
        'targetLocationCodes',
        'target_location_codes',
        'targetCountries',
        'target_countries',
        'countries',
        'country',
        'locations',
        'selectedLocations',
        'selected_locations',
        'selectedLocationNames',
        'selected_location_names',
      ]) {
        for (final value in values(source[key])) {
          final token = locationToken(value).trim();
          if (token.isEmpty) continue;
          targets.add(token.toLowerCase());
          final byCode = adCountriesByCode[token.toUpperCase()];
          final byName = adCountriesByName[token.toLowerCase()];
          if (byCode != null) targets.add(byCode.name.toLowerCase());
          if (byName != null) targets.add(byName.code.toLowerCase());
        }
      }
    }

    if (targets.isNotEmpty) {
      final shipping = _asMap(viewer['shipping_address']) ?? {};
      final countries = <String>{};
      for (final value in [
        viewer['country'],
        viewer['countryCode'],
        shipping['country'],
        shipping['countryCode'],
        shipping['country_code'],
      ]) {
        final token = '${value ?? ''}'.trim();
        if (token.isEmpty) continue;
        countries.add(token.toLowerCase());
        final byCode = adCountriesByCode[token.toUpperCase()];
        final byName = adCountriesByName[token.toLowerCase()];
        if (byCode != null) countries.add(byCode.name.toLowerCase());
        if (byName != null) countries.add(byName.code.toLowerCase());
      }
      // The web deliberately keeps targeted ads visible when no country is
      // stored yet, rather than incorrectly excluding an incomplete profile.
      if (countries.isNotEmpty && !targets.any(countries.contains)) {
        return false;
      }
    }

    dynamic firstValue(List<String> keys, [dynamic fallback]) {
      for (final source in [ad, draft]) {
        for (final key in keys) {
          final value = source[key];
          if (value != null && '$value'.trim().isNotEmpty) return value;
        }
      }
      return fallback;
    }

    final genderTarget =
        '${firstValue(const ['genderTarget', 'gender_target', 'targetGender', 'target_gender', 'selectedGender', 'selected_gender', 'gender'], 'All')}'
            .trim()
            .toLowerCase();
    if (genderTarget.isNotEmpty && genderTarget != 'all') {
      final viewerGender = '${viewer['gender'] ?? ''}'.trim().toLowerCase();
      if (viewerGender.isEmpty || viewerGender != genderTarget) return false;
    }

    double? numberValue(List<String> keys) {
      final parsed = double.tryParse('${firstValue(keys, '')}');
      return parsed?.isFinite == true ? parsed : null;
    }

    final ageMin = numberValue(const [
      'ageMin',
      'age_min',
      'targetAgeMin',
      'target_age_min',
    ]);
    final ageMax = numberValue(const [
      'ageMax',
      'age_max',
      'targetAgeMax',
      'target_age_max',
    ]);
    final hasRealAgeRestriction =
        !((ageMin == null || ageMin == 18) && (ageMax == null || ageMax == 65));
    if (hasRealAgeRestriction) {
      final rawDob = '${viewer['date_of_birth'] ?? viewer['dob'] ?? ''}'.trim();
      DateTime? dob;
      final ymd = RegExp(
        r'^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$',
      ).firstMatch(rawDob);
      final local = RegExp(
        r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$',
      ).firstMatch(rawDob);
      if (ymd != null) {
        dob = DateTime(
          int.parse(ymd[1]!),
          int.parse(ymd[2]!),
          int.parse(ymd[3]!),
        );
      } else if (local != null) {
        final first = int.parse(local[1]!);
        final second = int.parse(local[2]!);
        final month = first > 12 ? second : first;
        final day = first > 12 ? first : second;
        dob = DateTime(int.parse(local[3]!), month, day);
      } else {
        dob = DateTime.tryParse(rawDob);
      }
      if (dob != null) {
        final today = DateTime.now();
        var age = today.year - dob.year;
        if (today.month < dob.month ||
            (today.month == dob.month && today.day < dob.day)) {
          age--;
        }
        if (ageMin != null && age < ageMin) return false;
        if (ageMax != null && age > ageMax) return false;
      }
    }
    return true;
  }

  static HomeAd _parseHomeAd(Map<String, dynamic> m) {
    final draft = _asMap(m["editDraft"] ?? m["edit_draft"]) ?? {};
    int countFrom(List<dynamic> values) {
      for (final value in values) {
        if (value == null) continue;
        final parsed = int.tryParse("$value");
        if (parsed != null) return parsed;
      }
      return 0;
    }

    final carryOverViews = countFrom([
      draft["carryOverViews"],
      draft["carry_over_views"],
    ]).clamp(0, 0x7fffffff);
    final adId = (m["adId"] ?? m["ad_id"] ?? "${m["id"]}")
        .toString()
        .replaceFirst(RegExp(r"^ad-"), "");
    final campaignType = (m["campaign_type"] ?? m["campaignType"] ?? "Ads")
        .toString();
    final isProduct = campaignType.trim().toLowerCase() == "product promote";
    final raw = _asMap(m["raw"]) ?? {};
    final productGallery = _mediaList([
      m["images"],
      m["media_gallery"],
      m["mediaGallery"],
      m["gallery"],
      m["product_images"],
      m["productImages"],
      m["variants"],
      m["product"],
      m["linked_product"],
      m["linkedProduct"],
      draft["images"],
      draft["mediaGallery"],
      draft["media_gallery"],
      draft["gallery"],
    ]);
    final adGallery = _mediaList([
      m["media_gallery"],
      m["mediaGallery"],
      m["gallery"],
      m["media"],
      draft["mediaGallery"],
      draft["media_gallery"],
      draft["gallery"],
      m["images"],
    ]);
    final gallery = isProduct ? productGallery : adGallery;
    final media = isProduct
        ? _firstMedia([
            m["image_url"],
            m["imageUrl"],
            m["main_image"],
            m["mainImage"],
            m["media_preview"],
            m["mediaPreview"],
            m["thumbnail_url"],
            m["thumbnailUrl"],
            m["media_url"],
            m["mediaUrl"],
            m["product_image"],
            m["productImage"],
            m["product"],
            m["linked_product"],
            m["linkedProduct"],
            productGallery,
          ])
        : _firstMedia([
            m["media_preview"],
            m["mediaPreview"],
            m["media_url"],
            m["mediaUrl"],
            m["video_url"],
            m["videoUrl"],
            m["thumbnail_url"],
            m["thumbnailUrl"],
            draft["mediaPreview"],
            draft["media_preview"],
            draft["mediaUrl"],
            draft["media_url"],
            draft["video_url"],
            adGallery,
          ]);
    return HomeAd(
      adId: adId,
      campaignType: campaignType,
      title: (m["title"] ?? m["topic"] ?? draft["topic"] ?? campaignType)
          .toString(),
      description: (m["description"] ?? "").toString(),
      mediaPreview: media.isEmpty ? "" : resolveMedia(media),
      mediaGallery: gallery.map(resolveMedia).toList(),
      mediaType: (m["media_type"] ?? m["mediaType"] ?? "").toString(),
      username:
          (m["owner_username"] ??
                  m["ownerUsername"] ??
                  m["username"] ??
                  (m["user"] is Map ? m["user"]["username"] : null) ??
                  "Ads")
              .toString(),
      fullName:
          (m["full_name"] ??
                  (m["user"] is Map ? m["user"]["full_name"] : null) ??
                  "")
              .toString(),
      avatar: resolveAvatar(
        (m["profile_picture"] ??
                m["profilePicture"] ??
                m["owner_profile_picture"] ??
                m["ownerProfilePicture"] ??
                m["avatar"] ??
                (m["user"] is Map ? m["user"]["profile_picture"] : null) ??
                (m["user"] is Map ? m["user"]["profilePicture"] : null) ??
                (m["user"] is Map ? m["user"]["avatar"] : null) ??
                "")
            .toString(),
      ),
      feedCategory:
          (m["category"] ??
                  m["manual_category"] ??
                  m["manualCategory"] ??
                  m["topic"] ??
                  draft["category"] ??
                  draft["manual_category"] ??
                  draft["manualCategory"] ??
                  draft["topic"] ??
                  "")
              .toString(),
      ctaTopic: (draft["ctaTopic"] ?? m["cta_topic"] ?? "Visit").toString(),
      ctaValue: (draft["ctaValue"] ?? m["cta_value"] ?? "").toString(),
      activeLink:
          (draft["activeLink"] ??
                  m["active_link"] ??
                  m["activeLink"] ??
                  draft["ctaValue"] ??
                  m["cta_value"] ??
                  "")
              .toString(),
      price: isProduct
          ? (double.tryParse(
                  "${m["price"] ?? m["main_price"] ?? m["product_price"] ?? 0}",
                ) ??
                0)
          : (double.tryParse("${m["budget"] ?? 0}") ?? 0),
      promoPrice: double.tryParse("${m["promo_price"] ?? ""}"),
      discount: _parseAdDiscount(m["commission_info"]),
      resellCommission: _parseAdResellCommission(m["commission_info"]),
      linkedProductId:
          int.tryParse(
            "${m["linked_product_id"] ?? m["product_id"] ?? m["productId"] ?? 0}",
          ) ??
          0,
      featuredItems: _parseFeaturedItems(draft),
      linkedProductShareCode:
          (m["linked_product_share_code"] ??
                  m["linked_product_code"] ??
                  m["share_code"] ??
                  "")
              .toString(),
      shareCode:
          (m["canonical_share_code"] ??
                  m["adShareCode"] ??
                  m["ad_share_code"] ??
                  raw["canonical_share_code"] ??
                  raw["adShareCode"] ??
                  raw["ad_share_code"] ??
                  (isProduct ? "" : (m["share_code"] ?? m["shareCode"])) ??
                  (isProduct ? "" : (raw["share_code"] ?? raw["shareCode"])) ??
                  "")
              .toString(),
      ownerUserId:
          (m["user_id"] ??
                  m["userId"] ??
                  m["owner_user_id"] ??
                  m["ownerUserId"] ??
                  m["advertiser_id"] ??
                  m["advertiserId"] ??
                  (m["user"] is Map ? m["user"]["id"] : null) ??
                  (m["user"] is Map ? m["user"]["user_id"] : null) ??
                  (m["user"] is Map ? m["user"]["userId"] : null) ??
                  "")
              .toString(),
      status: (m["status"] ?? "").toString(),
      feedSortAt:
          (m["active_start_time"] ??
                  m["activeStartTime"] ??
                  m["started_at"] ??
                  m["startedAt"] ??
                  m["approved_at"] ??
                  m["approvedAt"] ??
                  m["created_at"] ??
                  m["createdAt"] ??
                  m["updated_at"] ??
                  m["updatedAt"] ??
                  "")
              .toString(),
      likes: countFrom([m["likes_count"], m["likeCount"], m["likes"]]),
      comments: countFrom([
        m["comments_count"],
        m["commentCount"],
        m["comments"],
      ]),
      views:
          countFrom([m["views_count"], m["viewCount"], m["views"]]) +
          carryOverViews,
      shares: countFrom([m["shares_count"], m["shareCount"], m["shares"]]),
      liked: m["user_liked"] == true,
      likeLocked: m["ad_like_locked"] == true,
      coinCollected: m["ad_coin_collected"] == true,
    );
  }

  /// commission_info may be a JSON string or map — pull the seller discount %.
  static String _firstMedia(List<dynamic> values) {
    const keys = [
      "media_preview",
      "mediaPreview",
      "image_url",
      "imageUrl",
      "image",
      "thumbnail_url",
      "thumbnailUrl",
      "media_url",
      "mediaUrl",
      "video_url",
      "videoUrl",
      "product_image",
      "productImage",
      "main_image",
      "mainImage",
      "featured_image",
      "featuredImage",
      "url",
      "src",
    ];
    for (final value in values) {
      if (value == null) continue;
      if (value is String && value.trim().isNotEmpty) return value.trim();
      if (value is List) {
        final nested = _firstMedia(value);
        if (nested.isNotEmpty) return nested;
      }
      if (value is Map) {
        for (final key in keys) {
          final found = _firstMedia([value[key]]);
          if (found.isNotEmpty) return found;
        }
        for (final key in [
          "images",
          "product_images",
          "media_gallery",
          "mediaGallery",
          "media",
          "variants",
        ]) {
          final found = _firstMedia([value[key]]);
          if (found.isNotEmpty) return found;
        }
      }
    }
    return "";
  }

  static bool _looksVideoMedia(String value) {
    final lower = value.trim().toLowerCase();
    if (lower.isEmpty || lower.startsWith('data:image/')) return false;
    if (lower.startsWith('data:video/')) return true;
    return RegExp(
      r'\.(mp4|webm|mov|m4v|ogg|avi|mkv|mpeg|mpg)(\?.*)?$',
      caseSensitive: false,
    ).hasMatch(lower);
  }

  static String _firstImageMedia(List<dynamic> values) {
    for (final value in _mediaList(values)) {
      if (!_looksVideoMedia(value)) return value;
    }
    return "";
  }

  static List<String> _mediaList(List<dynamic> values) {
    final out = <String>[];
    void add(String value) {
      final trimmed = value.trim();
      if (trimmed.isEmpty) return;
      if (!out.contains(trimmed)) out.add(trimmed);
    }

    void walk(dynamic value) {
      if (value == null) return;
      if (value is String) {
        final trimmed = value.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try {
            walk(jsonDecode(trimmed));
            return;
          } catch (_) {}
        }
        add(trimmed);
        return;
      }
      if (value is List) {
        for (final item in value) {
          walk(item);
        }
        return;
      }
      if (value is Map) {
        for (final key in const [
          "media_preview",
          "mediaPreview",
          "image_url",
          "imageUrl",
          "image",
          "thumbnail_url",
          "thumbnailUrl",
          "media_url",
          "mediaUrl",
          "video_url",
          "videoUrl",
          "url",
          "src",
          "path",
          "file_url",
          "fileUrl",
          "main_image",
          "mainImage",
          "featured_image",
          "featuredImage",
        ]) {
          if (value.containsKey(key)) walk(value[key]);
        }
        for (final key in const [
          "media_gallery",
          "mediaGallery",
          "gallery",
          "images",
          "product_images",
          "productImages",
          "variants",
          "items",
        ]) {
          if (value.containsKey(key)) walk(value[key]);
        }
      }
    }

    for (final value in values) {
      walk(value);
    }
    return out;
  }

  static String _parseAdDiscount(dynamic info) {
    try {
      final map = info is String ? jsonDecode(info) : info;
      if (map is! Map) return "";
      final d = double.tryParse("${map["discount"] ?? ""}") ?? 0;
      return d > 0 ? "${d % 1 == 0 ? d.toInt() : d}" : "";
    } catch (_) {
      return "";
    }
  }

  static String _parseAdResellCommission(dynamic info) {
    try {
      final map = info is String ? jsonDecode(info) : info;
      if (map is! Map) return "";
      final value =
          map["resell_percentage"] ??
          map["resell_percent"] ??
          map["resell_commission"] ??
          map["reseller_commission"] ??
          map["resell_amount"];
      final amount = double.tryParse("${value ?? ""}") ?? 0;
      return amount > 0 ? "${amount % 1 == 0 ? amount.toInt() : amount}" : "";
    } catch (_) {
      return "";
    }
  }

  /// Profile Promote editDraft.featuredItems — the 3-item product/content grid.
  static List<Map<String, dynamic>> _parseFeaturedItems(
    Map<String, dynamic> draft,
  ) {
    final raw = draft["featuredItems"] ?? draft["featured_items"];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .take(3)
        .toList();
  }

  /// POST /market/collect-coin — collect the ad's Rupieer coin after liking.
  /// Returns the collected amount (or 1) on success, null on failure.
  static Future<double?> collectAdCoin(
    String adId, {
    String adType = "Ads",
  }) async {
    if (!loggedIn) return null;
    try {
      final data = await _post("/market/collect-coin", {
        "ad_id": adId.replaceFirst(RegExp(r"^ad-"), ""),
        "ad_type": adType,
      });
      if (data is Map && (data["success"] == false)) return null;
      return double.tryParse("${data?["amount"] ?? 1}") ?? 1;
    } catch (_) {
      return null;
    }
  }

  /// GET /market/ad-coin-settings — public reward config for the "collect coin"
  /// button on promoted ads (web marketService.getAdCoinSettingsPublic).
  static Future<Map<String, dynamic>?> adCoinSettings() async {
    try {
      final data = await _get("/market/ad-coin-settings");
      if (data is Map) {
        final s = data["settings"] ?? data["data"] ?? data;
        if (s is Map) return Map<String, dynamic>.from(s);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// GET /ads/my — the signed-in user's own ads (web adsService.getMyAds),
  /// merged into the home feed so a user sees their own promotions.
  static Future<List<Map<String, dynamic>>> myAds() async {
    if (!loggedIn) return const [];
    try {
      final data = await _get("/ads/my");
      final list = _unwrapList(data, ["ads", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// PUT /ads/:adId {status} — pause, resume or cancel one of my ads. The web
  /// drives all three from the same call (adsService.updateAd / cancelAd).
  /// Returns null on success, an error message otherwise.
  static Future<String?> setAdStatus(String adId, String status) async {
    final id = adId.replaceFirst(RegExp(r"^ad-"), "");
    if (id.isEmpty) return "Ad ID not found";
    try {
      await _put("/ads/${Uri.encodeComponent(id)}", {"status": status});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Failed to update ad.";
    }
  }

  /// GET /admin/customization/upload-control/public — public upload limits/flags
  /// (web adsService.getUploadControlSettingsPublic).
  /// GET /ads/:adId/analytics - same live analytics payload as the web modal.
  static Future<Map<String, dynamic>?> adAnalytics(String adId) async {
    final id = adId.replaceFirst(RegExp(r"^ad-"), "");
    if (id.isEmpty || !loggedIn) return null;
    try {
      final data = await _get("/ads/${Uri.encodeComponent(id)}/analytics");
      final analytics = data is Map ? data["analytics"] : null;
      return analytics is Map ? Map<String, dynamic>.from(analytics) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> uploadControlSettings() async {
    try {
      final data = await _get("/admin/customization/upload-control/public");
      if (data is Map) {
        final s = data["settings"] ?? data["data"] ?? data;
        if (s is Map) return Map<String, dynamic>.from(s);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  // ── Home-feed config (same public settings the web dashboard reads on mount).
  // Defaults keep current behaviour if a fetch fails, so this can never break
  // the feed — it only refines it.
  static bool adCoinRewardEnabled = true;
  static double adCoinRewardAmount = 1;
  static int flashPreviewSeconds = 5;
  static bool flashAutoPlay = false;
  static List<Map<String, dynamic>> myActiveAds = const [];

  static bool _truthy(dynamic v) =>
      v == true || v == 1 || '$v' == 'true' || '$v' == '1';

  /// Loads the three public config calls the web home feed makes on mount:
  /// ad-coin reward settings, flash upload-control, and the user's own ads.
  /// Called once per feed load; failures fall back to the defaults above.
  static Future<void> loadFeedSettings() async {
    final coin = await adCoinSettings();
    if (coin != null) {
      final enabled =
          coin["is_active"] ?? coin["enabled"] ?? coin["ad_coin_enabled"];
      if (enabled != null) adCoinRewardEnabled = _truthy(enabled);
      final amt = double.tryParse(
        '${coin["user_reward_amount"] ?? coin["amount"] ?? coin["reward"] ?? ''}',
      );
      if (amt != null && amt > 0) adCoinRewardAmount = amt;
    }
    final flash = await uploadControlSettings();
    if (flash != null) {
      final ap = flash["flash_auto_play"] ?? flash["flashAutoPlay"];
      if (ap != null) flashAutoPlay = _truthy(ap);
      final ps = int.tryParse(
        '${flash["flash_preview_seconds"] ?? flash["flashPreviewSeconds"] ?? ''}',
      );
      if (ps != null && ps > 0) flashPreviewSeconds = ps;
    }
    myActiveAds = await myAds();
  }

  /// GET /market?user_id=X — a promoted profile's active market items
  /// (used by the Profile Promote card grid, same as the web card).
  static Future<List<String>> categories() async {
    try {
      final data = await _get("/categories/tree?includeInactive=0");
      final raw = _unwrapList(data, ["categories", "data", "items"]);
      final names = <String>["All"];

      void walk(dynamic value) {
        if (value is Map) {
          final active = value["is_active"] ?? value["isActive"] ?? true;
          final name = (value["name"] ?? value["title"] ?? "")
              .toString()
              .trim();
          if (active != false && name.isNotEmpty && !names.contains(name)) {
            names.add(name);
          }
          final children =
              value["children"] ?? value["subcategories"] ?? value["items"];
          if (children is List) {
            for (final child in children) {
              walk(child);
            }
          }
        }
      }

      for (final item in raw) {
        walk(item);
      }
      return names.take(16).toList();
    } catch (_) {
      return const ["All", "Trending", "Comedy", "General"];
    }
  }

  static Future<List<Map<String, dynamic>>> userMarketItems(
    String userId,
  ) async {
    if (userId.trim().isEmpty) return const [];
    try {
      final data = await _get(
        "/market?user_id=${Uri.encodeComponent(userId)}&status=active,approved",
      );
      final list = _unwrapList(data, ["data", "items", "products"]);
      return list
          .whereType<Map>()
          .where((m) => m["is_sponsored"] != true)
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<List<Product>> userProducts(dynamic userId) async {
    final rows = await userMarketItems("$userId");
    return rows.map((m) {
      String image = "";
      for (final key in [
        "main_image",
        "image_url",
        "product_image",
        "cover_image",
        "thumbnail",
        "thumbnail_url",
        "media_url",
      ]) {
        final value = m[key];
        if (value != null && value.toString().trim().isNotEmpty) {
          image = value.toString();
          break;
        }
      }
      if (image.isEmpty) {
        final gallery =
            m["images"] ??
            m["product_images"] ??
            m["media_gallery"] ??
            m["media"];
        if (gallery is List && gallery.isNotEmpty) {
          final first = gallery.first;
          image = first is Map
              ? (first["url"] ??
                        first["src"] ??
                        first["path"] ??
                        first["image_url"] ??
                        first["media_url"] ??
                        "")
                    .toString()
              : first.toString();
        }
      }
      final promo = double.tryParse("${m["promo_price"] ?? ""}");
      final basePrice = double.tryParse("${m["price"] ?? 0}") ?? 0;
      final avatar =
          (m["profile_picture"] ??
                  m["owner_profile_picture"] ??
                  m["seller_avatar"] ??
                  "")
              .toString();
      return Product(
        id: int.tryParse("${m["id"]}") ?? 0,
        title: (m["title"] ?? m["name"] ?? "Product").toString(),
        price: promo != null && promo > 0 ? promo : basePrice,
        oldPrice: promo != null && promo > 0 && promo < basePrice
            ? basePrice
            : null,
        image: image.isEmpty ? "" : resolveMedia(image),
        seller: (m["owner_username"] ?? m["username"] ?? "googer").toString(),
        sellerAvatar: avatar.isEmpty ? "" : resolveAvatar(avatar),
        rating: double.tryParse("${m["rating"] ?? 4.5}") ?? 4.5,
        sold: int.tryParse("${m["sold"] ?? m["sales_count"] ?? 0}") ?? 0,
        category: (m["category"] ?? m["manual_category"] ?? "General")
            .toString(),
        description: (m["description"] ?? "").toString(),
        likes: int.tryParse("${m["likes_count"] ?? 0}") ?? 0,
        views: int.tryParse("${m["views_count"] ?? 0}") ?? 0,
        comments: int.tryParse("${m["comments_count"] ?? 0}") ?? 0,
        shares: int.tryParse("${m["shares_count"] ?? 0}") ?? 0,
        liked: m["user_liked"] == true,
      );
    }).toList();
  }

  /// POST /market/{ad-N}/like — returns new liked state, null on failure.
  static Future<bool?> toggleAdLike(String interactionId) async {
    if (!loggedIn) return null;
    try {
      final data = await _post("/market/$interactionId/like", {});
      return data?["liked"] == true;
    } catch (_) {
      return null;
    }
  }

  static Future<int?> markAdView(String interactionId) async {
    try {
      final data = await _post("/market/$interactionId/view", {});
      return int.tryParse(
        '${data?["views_count"] ?? data?["viewCount"] ?? data?["views"] ?? ''}',
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> markAdImpression(String interactionId) async {
    try {
      await _post("/market/$interactionId/impression", {});
    } catch (_) {}
  }

  static Future<int?> shareAd(String interactionId, {int? currentCount}) async {
    try {
      final data = await _post("/market/$interactionId/share", {});
      return resolveShareCountResponse(data, currentCount: currentCount);
    } catch (_) {
      return null;
    }
  }

  /// POST /market/{ad-N}/click — CTA click tracking (web marketService.logAdClick).
  /// actionType: "message" | "visit" | "call".
  static Future<void> markAdClick(
    String interactionId, [
    String? actionType,
  ]) async {
    try {
      await _post("/market/$interactionId/click", {
        if (actionType != null) "action_type": actionType,
      });
    } catch (_) {}
  }

  /// GET /market/{ad-N}/likes|shares|views|comments (kind plural)
  static Future<List<Map<String, dynamic>>> adInteractions(
    String interactionId,
    String kind,
  ) async {
    try {
      final data = await _get("/market/$interactionId/$kind");
      final list = _unwrapList(data, [kind, "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// [parentId] is intentionally `dynamic`: sponsored-ad comment ids come back
  /// as strings like `ad-comment-12`, and the backend strips that prefix
  /// itself. Forcing them through `int` silently dropped the parent, which
  /// turned every reply into a new top-level comment.
  static Future<bool> addAdComment(
    String interactionId,
    String text, {
    dynamic parentId,
  }) async {
    if (!loggedIn) return false;
    try {
      await _post("/market/$interactionId/comments", {
        "comment": text,
        "text": text,
        if (parentId != null) "parent_id": parentId,
        if (parentId != null) "parentId": parentId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /ads/{id}/report — null on success, else the server's message
  /// (e.g. 409 "Already reported", 400 "Reason required").
  static Future<String?> reportAd(
    String adId,
    String reason, [
    String customReason = "",
  ]) async {
    if (!loggedIn) return "Please log in to report this ad.";
    try {
      await _post("/ads/${adId.replaceFirst(RegExp(r"^ad-"), "")}/report", {
        "reason": reason,
        "custom_reason": customReason,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── shop (market) ── */

  static Future<List<Product>> shopProducts() async {
    try {
      final data = await _get("/market/products?limit=40");
      final list = _unwrapList(data, ["products", "data", "items"]);
      return list.map<Product>((raw) {
        final m = Map<String, dynamic>.from(raw as Map);
        // image priority matches web/backend market shapes, including storage-bucket paths.
        String img = "";
        for (final key in [
          "main_image",
          "mainImage",
          "image_url",
          "imageUrl",
          "product_image",
          "productImage",
          "cover_image",
          "coverImage",
          "thumbnail",
          "thumbnail_url",
          "media_url",
          "mediaUrl",
          "photo_url",
          "photoUrl",
        ]) {
          final v = m[key];
          if (v != null && v.toString().isNotEmpty) {
            img = v.toString();
            break;
          }
        }
        if (img.isEmpty) {
          final media =
              m["images"] ??
              m["product_images"] ??
              m["gallery"] ??
              m["media_gallery"] ??
              m["mediaGallery"] ??
              m["media"];
          if (media is List && media.isNotEmpty) {
            final first = media.first;
            img = first is Map
                ? (first["url"] ??
                          first["src"] ??
                          first["path"] ??
                          first["image_url"] ??
                          first["media_url"] ??
                          "")
                      .toString()
                : first.toString();
          }
        }
        final owner = m["user"] is Map
            ? Map<String, dynamic>.from(m["user"])
            : m["owner"] is Map
            ? Map<String, dynamic>.from(m["owner"])
            : <String, dynamic>{};
        final sellerAvatar =
            (m["profile_picture"] ??
                    m["owner_profile_picture"] ??
                    m["seller_avatar"] ??
                    m["avatar"] ??
                    owner["profile_picture"] ??
                    owner["avatar"] ??
                    "")
                .toString();
        final promo = double.tryParse("${m["promo_price"] ?? ""}");
        final basePrice = double.tryParse("${m["price"] ?? 0}") ?? 0;
        return Product(
          id: int.tryParse("${m["id"]}") ?? 0,
          title: (m["title"] ?? m["name"] ?? "Product").toString(),
          price: promo != null && promo > 0 ? promo : basePrice,
          oldPrice: promo != null && promo > 0 && promo < basePrice
              ? basePrice
              : null,
          image: img.isEmpty ? "" : resolveMedia(img),
          seller:
              (m["owner_username"] ??
                      m["shop_name"] ??
                      m["username"] ??
                      owner["username"] ??
                      "Googer Seller")
                  .toString(),
          sellerAvatar: sellerAvatar.isEmpty ? "" : resolveMedia(sellerAvatar),
          rating: double.tryParse("${m["rating"] ?? 4.5}") ?? 4.5,
          sold: int.tryParse("${m["sold"] ?? m["sales_count"] ?? 0}") ?? 0,
          category: (m["category"] ?? m["manual_category"] ?? "General")
              .toString(),
          description: (m["description"] ?? "").toString(),
          likes: int.tryParse("${m["likes_count"] ?? 0}") ?? 0,
          views: int.tryParse("${m["views_count"] ?? 0}") ?? 0,
          comments: int.tryParse("${m["comments_count"] ?? 0}") ?? 0,
          shares: int.tryParse("${m["shares_count"] ?? 0}") ?? 0,
          liked: m["user_liked"] == true,
        );
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  /* ── chat ── */

  /// Support threads are hidden on the web, so they are dropped here too.
  /// The backend renames super-admin peers to "Googer Support"
  /// (chatController.js:1236) — match on the role rather than the label, since
  /// the label is localised presentation.
  /// Peer details may be flat (`participant_*`) or nested under one of several
  /// keys depending on the serializer, so both shapes have to be searched.
  static Map<String, dynamic> _peerOf(Map raw) {
    for (final key in const [
      "peer",
      "user",
      "other_user",
      "participant",
      "partner",
    ]) {
      if (raw[key] is Map) return Map<String, dynamic>.from(raw[key] as Map);
    }
    return Map<String, dynamic>.from(raw);
  }

  static bool _isSupportConversation(dynamic raw) {
    if (raw is! Map) return false;
    final peer = _peerOf(raw);
    final role =
        "${raw["participant_role"] ?? peer["user_type"] ?? raw["user_type"] ?? ""}"
            .toLowerCase()
            .replaceAll("_", "");
    if (role == "superadmin") return true;
    // The label is the fallback signal — the backend renames super admins to
    // "Googer Support" and the role is not always carried through.
    for (final candidate in [
      raw["participant_display_name"],
      raw["participant_name"],
      peer["full_name"],
      peer["name"],
    ]) {
      if ("${candidate ?? ""}".trim().toLowerCase() == "googer support") {
        return true;
      }
    }
    return false;
  }

  /// The latest message, which arrives either as a plain string or as a whole
  /// message object. Calling `toString()` on the object dumps
  /// `{id: 837, sender_id: 4, …}` straight into the list, so it has to be
  /// unpacked rather than stringified.
  static (String, String, String) _lastMessageOf(Map m) {
    final raw =
        m["last_message"] ?? m["lastMessage"] ?? m["last"] ?? m["preview"];
    if (raw is Map) {
      return (
        "${raw["type"] ?? raw["message_type"] ?? ""}",
        "${raw["text"] ?? raw["message_text"] ?? raw["message"] ?? ""}",
        "${raw["sender_id"] ?? raw["senderId"] ?? ""}",
      );
    }
    return (
      "${m["message_type"] ?? m["last_message_type"] ?? ""}",
      "${raw ?? m["message_text"] ?? ""}",
      "${m["sender_id"] ?? ""}",
    );
  }

  @visibleForTesting
  static (String, String, String) debugLastMessageOf(Map<String, dynamic> m) =>
      _lastMessageOf(m);

  @visibleForTesting
  static bool debugIsSupportConversation(Map<String, dynamic> raw) =>
      _isSupportConversation(raw);

  /// A conversation title must never be a raw identifier. When the backend has
  /// no display name the fallback chain can land on an id column, which shows
  /// up in the list as a bare number (or the literal word "id"). Prefer the
  /// username in that case.
  static String _conversationTitle(String name, String username) {
    final cleaned = name.trim();
    final looksLikeId =
        cleaned.isEmpty ||
        cleaned.toLowerCase() == "id" ||
        RegExp(r"^#?\d+$").hasMatch(cleaned) ||
        RegExp(r"^id[\s:_-]*\d+$", caseSensitive: false).hasMatch(cleaned);
    if (!looksLikeId) return cleaned;
    final handle = username.trim();
    return handle.isEmpty || handle == "user" ? "Googer user" : handle;
  }

  /// Human preview for the list row. Media messages carry a URL (often a long
  /// data URL) in the body, which must never be printed as the preview.
  static String _conversationPreview(String type, String text) {
    switch (type.toLowerCase()) {
      case "voice":
      case "voice_tts":
        return "Voice message";
      case "sticker":
        return "Sticker";
      case "image":
        return "Photo";
      case "video":
        return "Video";
      case "file":
        return "Attachment";
    }
    final body = text.trim();
    if (body.startsWith("data:") || body.startsWith("blob:")) {
      return "Attachment";
    }
    // Colour markup is presentation, not content.
    return body.replaceAll(RegExp(r"\[/?c(=[^\]]*)?\]"), "");
  }

  @visibleForTesting
  static String debugConversationTitle(String name, String username) =>
      _conversationTitle(name, username);

  @visibleForTesting
  static String debugConversationPreview(String type, String text) =>
      _conversationPreview(type, text);

  static Future<List<Conversation>> chats() async {
    try {
      final data = await _get("/chat/conversations");
      final list = _unwrapList(data, ["conversations", "data", "items"]);
      return list
          .where((raw) => !_isSupportConversation(raw))
          .map<Conversation>((raw) {
            final m = Map<String, dynamic>.from(raw as Map);
            // peer info may be flat or nested under peer/user/other_user/participant
            Map<String, dynamic> peer = m;
            for (final key in [
              "peer",
              "user",
              "other_user",
              "participant",
              "partner",
            ]) {
              if (m[key] is Map) {
                peer = Map<String, dynamic>.from(m[key]);
                break;
              }
            }
            // `GET /chat/conversations` returns flat `participant_*` columns
            // (chatController.js:1226); those must be read first or the real
            // avatar and name are never found and every row falls back to a
            // placeholder initial.
            final pic =
                (m["participant_profile_picture"] ??
                        peer["profile_picture"] ??
                        peer["img"] ??
                        peer["avatar"] ??
                        "")
                    .toString();
            final username =
                (m["participant_username"] ??
                        peer["username"] ??
                        m["peer_username"] ??
                        m["username"] ??
                        "user")
                    .toString();
            final rawName =
                (m["participant_display_name"] ??
                        m["participant_name"] ??
                        peer["full_name"] ??
                        peer["name"] ??
                        m["peer_name"] ??
                        m["full_name"] ??
                        "")
                    .toString();
            final (lastType, lastText, lastSender) = _lastMessageOf(m);
            return Conversation(
              username,
              _conversationTitle(rawName, username),
              pic.isEmpty ? "" : resolveMedia(pic),
              _conversationPreview(lastType, lastText),
              (m["updated_at"] ?? m["updatedAt"] ?? m["last_message_at"] ?? "")
                  .toString()
                  .split("T")
                  .first,
              int.tryParse(
                    "${m["unread"] ?? m["unread_count"] ?? m["unreadCount"] ?? 0}",
                  ) ??
                  0,
              m["online"] == true || peer["online"] == true,
              // `participant_id` must win. `peer` falls back to the whole row when
              // there is no nested peer object, so `peer["id"]` would resolve to
              // the *latest message* id and open the wrong thread.
              int.tryParse(
                    "${m["participant_id"] ?? peer["id"] ?? m["peer_id"] ?? m["user_id"] ?? 0}",
                  ) ??
                  0,
              MessageStatusRing.resolve(
                m["last_message"] is Map
                    ? Map<String, dynamic>.from(m["last_message"] as Map)
                    : m,
              ),
              lastSender.isNotEmpty && lastSender == currentUserId,
            );
          })
          // Defensive client-side guard: malformed/self conversations from an
          // older backend response must never render the logged-in user as a
          // person they can chat with.
          .where(
            (conversation) =>
                conversation.peerId.toString() != currentUserId.trim() &&
                conversation.username.trim().toLowerCase() !=
                    username.trim().toLowerCase(),
          )
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /* ── goog interactions (same endpoints as web googService) ── */

  static Future<Map<String, dynamic>?> toggleGoogLike(int id) async {
    try {
      final r = await _post("/googs/$id/like", {});
      return r is Map ? Map<String, dynamic>.from(r) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<int?> markGoogView(int id) async {
    try {
      final data = await _post("/googs/$id/view", {});
      return int.tryParse(
        '${data?["views_count"] ?? data?["viewCount"] ?? data?["views"] ?? ''}',
      );
    } catch (_) {
      return null;
    }
  }

  static Future<int?> shareGoog(int id, {int? currentCount}) async {
    try {
      final data = await _post("/googs/$id/share", {});
      return resolveShareCountResponse(data, currentCount: currentCount);
    } catch (_) {
      return null;
    }
  }

  /// POST /googs/{id}/report — null on success, else the server's message.
  static Future<String?> reportGoog(
    int id,
    String reason,
    String details,
  ) async {
    if (!loggedIn) return "Please log in to report this goog.";
    try {
      await _post("/googs/$id/report", {
        "reason": reason,
        "details": details,
        "custom_reason": details,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// type: likes | comments | shares | views — returns raw entries
  static Future<List<Map<String, dynamic>>> googInteractions(
    int id,
    String type,
  ) async {
    try {
      final data = await _get("/googs/$id/$type");
      final list = _unwrapList(data, [type, "data", "entries", "users"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> publicGoog(int id) async {
    try {
      final data = await _get("/googs/public/$id");
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<bool> postGoogComment(
    int id,
    String text, {
    dynamic parentId,
  }) async {
    try {
      await _post("/googs/$id/comments", {
        "text": text,
        "comment": text,
        if (parentId != null) "parent_id": parentId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Toggles the viewer's like on a goog comment. The backend treats a repeat
  /// tap as an un-like and returns the recomputed totals plus the viewer's
  /// resulting vote, so the UI can follow the server instead of guessing.
  static Future<Map<String, dynamic>?> likeGoogComment(
    dynamic commentId,
  ) async {
    try {
      final data = await _post("/googs/comments/$commentId/like", {});
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> dislikeGoogComment(
    dynamic commentId,
  ) async {
    try {
      final data = await _post("/googs/comments/$commentId/dislike", {});
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  /* ── upload content (vault / flash) — same as web uploadContentService ── */

  static Future<List<UploadContent>> uploadContents() async {
    try {
      final data = await _get("/upload-content/public");
      return _parseUploadContents(data);
    } catch (_) {
      return const [];
    }
  }

  static UploadContent? parseUploadContent(Map<String, dynamic> raw) {
    final parsed = _parseUploadContents({
      "contents": [raw],
    }, includeUnapproved: true);
    return parsed.isEmpty ? null : parsed.first;
  }

  static Future<Map<String, dynamic>?> uploadContentByShareCode(
    String shareCode,
  ) async {
    final code = shareCode.trim();
    if (code.isEmpty) return null;
    try {
      final data = await _get(
        "/upload-content/public/reel/${Uri.encodeComponent(code)}",
      );
      return _asMap(
        data is Map ? (data["content"] ?? data["data"] ?? data) : data,
      );
    } catch (_) {
      return null;
    }
  }

  /// Shared decoder for every `/upload-content/*` list response.
  static List<UploadContent> _parseUploadContents(
    dynamic data, {
    bool includeUnapproved = false,
  }) {
    try {
      final list = _unwrapList(data, ["contents", "data", "items"]);
      return list
          .whereType<Map>()
          .where((raw) {
            final status = (raw["status"] ?? "Approved").toString();
            return includeUnapproved || status.toLowerCase() == "approved";
          })
          .map<UploadContent>((raw) {
            final m = Map<String, dynamic>.from(raw);
            final owner = _asMap(m["user"] ?? m["owner"] ?? m["author"]) ?? {};
            final draft = _asMap(m["editDraft"] ?? m["edit_draft"]) ?? {};
            final mediaType = (m["media_type"] ?? m["mediaType"] ?? "")
                .toString();
            final previewUrl = (m["preview_url"] ?? m["previewUrl"] ?? "")
                .toString();
            final mediaPreviewSource =
                (m["media_preview"] ?? m["mediaPreview"] ?? "").toString();
            final rawHashtags = m["hashtags"];
            final hashtags = rawHashtags is List
                ? rawHashtags.map((e) => e.toString()).join(" ")
                : (rawHashtags ?? "").toString();
            // Playable media: prefer an uploaded video file from media_gallery,
            // then media_url, then the preview image (web watch-modal parity).
            final gallery = _mediaList([
              m["media_gallery"],
              m["mediaGallery"],
              m["gallery"],
              m["media"],
              m["files"],
              m["images"],
              draft["media_gallery"],
              draft["mediaGallery"],
              draft["gallery"],
              draft["media"],
              draft["files"],
              draft["images"],
            ]);
            final poster = _firstImageMedia([
              m["thumbnail_url"],
              m["thumbnailUrl"],
              m["thumbnailPreview"],
              draft["thumbnail_url"],
              draft["thumbnailUrl"],
              draft["thumbnailPreview"],
              m["preview_image"],
              m["previewImage"],
              m["poster_url"],
              m["posterUrl"],
              m["poster"],
              m["cover_url"],
              m["coverUrl"],
              m["cover"],
              m["image_url"],
              m["imageUrl"],
              m["main_image"],
              m["mainImage"],
              m["image"],
              draft["preview_image"],
              draft["previewImage"],
              draft["poster_url"],
              draft["posterUrl"],
              draft["poster"],
              draft["cover_url"],
              draft["coverUrl"],
              draft["cover"],
              draft["image_url"],
              draft["imageUrl"],
              draft["main_image"],
              draft["mainImage"],
              draft["image"],
              m["media_preview"],
              m["mediaPreview"],
              draft["media_preview"],
              draft["mediaPreview"],
              m["preview_url"],
              m["previewUrl"],
              draft["preview_url"],
              draft["previewUrl"],
              gallery,
            ]);
            final thumbnailSource = poster;
            final videoExt = RegExp(
              r"\.(mp4|webm|mov|m4v|ogg|avi|mkv|mpeg|mpg)(\?.*)?$",
              caseSensitive: false,
            );
            final galleryVideo = gallery.firstWhere(
              (entry) => videoExt.hasMatch(entry),
              orElse: () => "",
            );
            final playable = [
              (m["media_url"] ?? "").toString(),
              (draft["media_url"] ?? draft["mediaUrl"] ?? "").toString(),
              galleryVideo,
              gallery.isNotEmpty ? gallery.first : "",
              (m["preview_url"] ?? "").toString(),
              (draft["preview_url"] ?? draft["previewUrl"] ?? "").toString(),
              (m["media_preview"] ?? "").toString(),
              (draft["media_preview"] ?? draft["mediaPreview"] ?? "")
                  .toString(),
            ].firstWhere((v) => v.trim().isNotEmpty, orElse: () => "");
            final reachStage =
                (m["homeExpansionStage"] ?? m["home_expansion_stage"] ?? "")
                    .toString();
            final repostedBy =
                (m["reposted_by_username"] ?? m["reposted_by_full_name"] ?? "")
                    .toString();
            final visibleTime =
                m["status"] == "Approved" &&
                    (m["approved_at"] ?? "").toString().isNotEmpty
                ? m["approved_at"]
                : (m["created_at"] ?? m["updated_at"] ?? "");
            final explicitContentAccessMode =
                (m["content_access_mode"] ?? m["contentAccessMode"] ?? "")
                    .toString()
                    .trim();
            final contentAccessMode = explicitContentAccessMode.isNotEmpty
                ? explicitContentAccessMode
                : (_truthy(m["blurred"] ?? m["is_blurred"] ?? m["isBlurred"])
                      ? "blurred"
                      : "unblurred");
            final rawSubscriptionPackages =
                m["subscription_packages"] ?? m["subscriptionPackages"];
            final subscriptionPackages = rawSubscriptionPackages is List
                ? rawSubscriptionPackages
                      .whereType<Map>()
                      .map((rawPackage) {
                        final package = Map<String, dynamic>.from(rawPackage);
                        return UploadSubscriptionPackage(
                          id: '${package["id"] ?? ""}',
                          price:
                              double.tryParse('${package["price"] ?? 0}') ?? 0,
                          minutes:
                              int.tryParse(
                                '${package["minutes"] ?? package["days"] ?? 0}',
                              ) ??
                              0,
                          affiliateCommission:
                              double.tryParse(
                                '${package["affiliateCommission"] ?? package["affiliate_commission"] ?? 0}',
                              ) ??
                              0,
                        );
                      })
                      .where(
                        (package) =>
                            package.id.isNotEmpty &&
                            package.price > 0 &&
                            package.minutes > 0,
                      )
                      .take(3)
                      .toList(growable: false)
                : const <UploadSubscriptionPackage>[];
            return UploadContent(
              ownerUserId:
                  (m["user_id"] ??
                          m["userId"] ??
                          m["public_user_id"] ??
                          m["publicUserId"] ??
                          m["author_id"] ??
                          m["authorId"] ??
                          m["owner_user_id"] ??
                          m["ownerUserId"] ??
                          m["owner_id"] ??
                          m["ownerId"] ??
                          owner["id"] ??
                          owner["user_id"] ??
                          owner["userId"] ??
                          m["reposted_by_user_id"] ??
                          m["repostedByUserId"] ??
                          "")
                      .toString(),
              id: int.tryParse("${m["id"]}") ?? 0,
              contentId: (m["content_id"] ?? m["contentId"] ?? "").toString(),
              shareCode:
                  (m["canonical_share_code"] ??
                          m["uploadShareCode"] ??
                          m["upload_share_code"] ??
                          m["reel_share_code"] ??
                          m["reelShareCode"] ??
                          m["share_code"] ??
                          m["shareCode"] ??
                          "")
                      .toString(),
              type: (m["content_type"] ?? "vault").toString(),
              topic: (m["topic"] ?? "General").toString(),
              description: (m["description"] ?? "").toString(),
              hashtags: hashtags,
              thumbnail: poster.isEmpty ? "" : resolveMedia(poster),
              mediaUrl: playable.isEmpty ? "" : resolveMedia(playable),
              mediaGallery: gallery.map(resolveMedia).toList(),
              mediaType: mediaType,
              externalLink: (m["external_link"] ?? m["externalLink"] ?? "")
                  .toString(),
              status: (m["status"] ?? "Approved").toString(),
              createdAt: (m["created_at"] ?? "").toString(),
              approvedAt: (m["approved_at"] ?? "").toString(),
              expiresAt: (m["expires_at"] ?? "").toString(),
              approvalPlanSlug: (m["approval_plan_slug"] ?? "").toString(),
              approvalExpiryValue:
                  int.tryParse('${m["approval_expiry_value"] ?? 0}') ?? 0,
              approvalExpiryUnit: (m["approval_expiry_unit"] ?? "").toString(),
              ownerHasPaidPlan: m["owner_has_paid_plan"] == true,
              repostedAt: (m["reposted_at"] ?? "").toString(),
              repostedByName: repostedBy,
              pinnedAt: (m["pinned_at"] ?? m["pinnedAt"] ?? "").toString(),
              contentAccessMode: contentAccessMode,
              visibility: (m["visibility"] ?? "").toString(),
              affiliateCommission:
                  double.tryParse(
                    "${m["affiliate_commission"] ?? m["affiliateCommission"] ?? 0}",
                  ) ??
                  0,
              showLinkOnHome:
                  m["show_link_on_home"] == true ||
                  m["showLinkedContentOnHome"] == true,
              previewMode: (m["preview_mode"] ?? m["previewMode"] ?? "none")
                  .toString(),
              previewUrl: previewUrl.isEmpty ? "" : resolveMedia(previewUrl),
              mediaPreviewSource: mediaPreviewSource,
              thumbnailSource: thumbnailSource,
              previewUrlSource: previewUrl,
              mediaGallerySource: gallery,
              videoDurationSeconds:
                  double.tryParse(
                    "${m["video_duration_seconds"] ?? m["videoDurationSeconds"] ?? 0}",
                  ) ??
                  0,
              videoTrimStartSeconds:
                  double.tryParse(
                    "${m["video_trim_start_seconds"] ?? m["videoTrimStartSeconds"] ?? 0}",
                  ) ??
                  0,
              videoTrimEndSeconds:
                  double.tryParse(
                    "${m["video_trim_end_seconds"] ?? m["videoTrimEndSeconds"] ?? 0}",
                  ) ??
                  0,
              videoOriginalDurationSeconds:
                  double.tryParse(
                    "${m["video_original_duration_seconds"] ?? m["videoOriginalDurationSeconds"] ?? 0}",
                  ) ??
                  0,
              suggestedTopic: (m["topic"] ?? reachStage ?? "Suggested")
                  .toString(),
              coins: double.tryParse("${m["price"] ?? 0}") ?? 0,
              username:
                  (m["username"] ??
                          m["owner_username"] ??
                          m["ownerUsername"] ??
                          owner["username"] ??
                          "googer")
                      .toString(),
              fullName:
                  (m["full_name"] ??
                          m["fullName"] ??
                          m["owner_full_name"] ??
                          m["ownerFullName"] ??
                          owner["full_name"] ??
                          owner["fullName"] ??
                          owner["name"] ??
                          m["username"] ??
                          "Googer")
                      .toString(),
              avatar:
                  (m["profile_picture"] ??
                          m["profilePicture"] ??
                          m["owner_profile_picture"] ??
                          m["ownerProfilePicture"] ??
                          m["avatar"] ??
                          m["reposted_by_profile_picture"] ??
                          m["repostedByProfilePicture"] ??
                          "")
                      .toString()
                      .isEmpty
                  ? ""
                  : resolveMedia(
                      (m["profile_picture"] ??
                              m["profilePicture"] ??
                              m["owner_profile_picture"] ??
                              m["ownerProfilePicture"] ??
                              m["avatar"] ??
                              m["reposted_by_profile_picture"] ??
                              m["repostedByProfilePicture"])
                          .toString(),
                    ),
              time: relativeTime(visibleTime),
              likes: int.tryParse("${m["likes_count"] ?? 0}") ?? 0,
              comments: int.tryParse("${m["comments_count"] ?? 0}") ?? 0,
              views: int.tryParse("${m["views_count"] ?? 0}") ?? 0,
              shares: int.tryParse("${m["shares_count"] ?? 0}") ?? 0,
              reposts: int.tryParse("${m["reposts_count"] ?? 0}") ?? 0,
              liked: m["user_liked"] == true,
              hasAccess:
                  m["user_has_access"] == true || m["user_purchased"] == true,
              userReposted: m["user_reposted"] == true,
              showSuggested:
                  m["homeCanExpand"] == true ||
                  m["home_can_expand"] == true ||
                  reachStage.trim().isNotEmpty,
              allowComments:
                  m["allow_comments"] != false && m["allowComments"] != false,
              pinned: "${m["pinned_at"] ?? m["pinnedAt"] ?? ""}"
                  .trim()
                  .isNotEmpty,
              resellerRef: (m["reseller_ref"] ?? m["resell_ref"])?.toString(),
              subscriptionPackages: subscriptionPackages,
              purchaseExpiresAt:
                  '${m["user_purchase_expires_at"] ?? m["userPurchaseExpiresAt"] ?? ""}',
            );
          })
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<({bool liked, int likes})?> likeUploadContent(int id) async {
    try {
      final data = await _post("/upload-content/$id/like", {});
      return (
        liked: data?["liked"] == true,
        likes: int.tryParse('${data?["likes_count"] ?? ''}') ?? 0,
      );
    } catch (_) {
      return null;
    }
  }

  /// Unlock paid content with coins — POST /upload-content/{id}/purchase
  static Future<int?> shareUploadContent(int id) async {
    try {
      final data = await _post("/upload-content/$id/share", {});
      return int.tryParse("${data?["shares_count"] ?? ""}");
    } catch (_) {
      return null;
    }
  }

  /// POST /upload-content/{id}/report — null on success, else the server's
  /// message (e.g. "Already reported.", "Please choose a report reason.").
  static Future<String?> reportUploadContent(
    int id,
    String reason, [
    String customReason = "",
  ]) async {
    if (!loggedIn) return "Please log in to report this content.";
    try {
      await _post("/upload-content/$id/report", {
        "reason": reason,
        "custom_reason": customReason,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<({String? error, int? reposts, bool alreadyReposted})>
  repostUploadContent(int id) async {
    try {
      final data = await _post("/upload-content/$id/repost", {});
      return (
        error: null,
        reposts: int.tryParse("${data?["reposts_count"] ?? ""}"),
        alreadyReposted: data?["alreadyReposted"] == true,
      );
    } on ApiError catch (e) {
      return (error: e.message, reposts: null, alreadyReposted: false);
    } catch (_) {
      return (
        error: "Could not reach the server.",
        reposts: null,
        alreadyReposted: false,
      );
    }
  }

  static Future<int?> removeUploadRepost(int id) async {
    try {
      final data = await _delete("/upload-content/$id/repost");
      return int.tryParse("${data?["reposts_count"] ?? ""}");
    } catch (_) {
      return null;
    }
  }

  static Future<int?> markUploadView(int id) async {
    try {
      final data = await _post("/upload-content/$id/view", {});
      return int.tryParse(
        '${data?["views_count"] ?? data?["viewCount"] ?? data?["views"] ?? ''}',
      );
    } catch (_) {
      return null;
    }
  }

  static Future<String?> createUploadContent(
    Map<String, dynamic> body, {
    List<ApiUploadFile> media = const [],
    ApiUploadFile? preview,
  }) async {
    final result = await createUploadContentDetailed(
      body,
      media: media,
      preview: preview,
    );
    return result.error;
  }

  static Future<
    ({
      String? error,
      String contentId,
      bool pendingApproval,
      String status,
      String message,
    })
  >
  createUploadContentDetailed(
    Map<String, dynamic> body, {
    List<ApiUploadFile> media = const [],
    ApiUploadFile? preview,
    ApiUploadFile? thumbnail,
    void Function(double progress)? onProgress,
  }) async {
    if (!loggedIn) {
      return (
        error: "Please log in to upload content.",
        contentId: '',
        pendingApproval: false,
        status: '',
        message: '',
      );
    }
    try {
      final files = [
        ...media.take(5).map((file) => file.withField("images")),
        if (preview != null) preview.withField("preview"),
        if (thumbnail != null) thumbnail.withField("thumbnail"),
      ];
      final response = await _multipart(
        "POST",
        "/upload-content",
        body,
        files,
        onProgress: onProgress,
      );
      final envelope = _asMap(response);
      final content = _asMap(envelope?["content"]) ?? envelope;
      final contentId =
          '${content?["contentId"] ?? content?["content_id"] ?? content?["id"] ?? body["contentId"] ?? ""}'
              .trim();
      final status = '${content?["status"] ?? ""}'.trim();
      final pendingApproval =
          envelope?["pendingApproval"] == true ||
          status.toLowerCase() == 'pending approval';
      return (
        error: null,
        contentId: contentId,
        pendingApproval: pendingApproval,
        status: status,
        message: '${envelope?["message"] ?? ""}'.trim(),
      );
    } on ApiError catch (e) {
      return (
        error: e.message,
        contentId: '',
        pendingApproval: false,
        status: '',
        message: '',
      );
    } catch (_) {
      return (
        error: "Could not reach the server.",
        contentId: '',
        pendingApproval: false,
        status: '',
        message: '',
      );
    }
  }

  static Future<List<Map<String, dynamic>>> uploadInteractions(
    int id,
    String kind,
  ) async {
    try {
      final data = await _get("/upload-content/$id/$kind");
      final list = _unwrapList(data, [kind, "data", "items", "users"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Content insights for an upload — web GET /upload-content/{id}/insights.
  /// Returns the raw `insights` object (totals/trend/countries/…) or null.
  static Future<Map<String, dynamic>?> uploadContentInsights(
    int id,
    String range,
  ) async {
    try {
      final data = await _get(
        "/upload-content/$id/insights?range=${Uri.encodeComponent(range)}",
      );
      if (data is Map) {
        final insights = data["insights"] ?? data["data"] ?? data;
        if (insights is Map) return Map<String, dynamic>.from(insights);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> addUploadComment(
    int id,
    String text, {
    dynamic parentId,
  }) async {
    if (!loggedIn) return false;
    try {
      await _post("/upload-content/$id/comments", {
        "comment": text,
        "text": text,
        if (parentId != null) "parentId": parentId,
        if (parentId != null) "parent_id": parentId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// DELETE /upload-content/comments/{id}
  static Future<bool> deleteUploadComment(int commentId) async {
    try {
      await _delete("/upload-content/comments/$commentId");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /upload-content/comments/{id}/report
  static Future<bool> reportUploadComment(int commentId, String reason) async {
    try {
      await _post("/upload-content/comments/$commentId/report", {
        "reason": reason,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /upload-content/comments/{id}/like
  static Future<Map<String, dynamic>?> likeUploadComment(
    dynamic commentId,
  ) async {
    try {
      final data = await _post("/upload-content/comments/$commentId/like", {});
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  /// POST /upload-content/comments/{id}/dislike
  static Future<Map<String, dynamic>?> dislikeUploadComment(
    dynamic commentId,
  ) async {
    try {
      final data = await _post(
        "/upload-content/comments/$commentId/dislike",
        {},
      );
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<String?> purchaseUploadContent(
    int id, {
    String? resellerRef,
  }) async {
    try {
      await _post("/upload-content/$id/purchase", {
        if (resellerRef != null && resellerRef.isNotEmpty)
          "reseller_ref": resellerRef,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<({String? error, String? expiresAt})>
  purchaseUploadCreatorSubscription(
    int id,
    String packageId, {
    String? resellerRef,
  }) async {
    try {
      final data = await _post("/upload-content/$id/subscriptions/purchase", {
        "packageId": packageId,
        if (resellerRef != null && resellerRef.isNotEmpty)
          "reseller_ref": resellerRef,
      });
      final subscription = data is Map ? data["subscription"] : null;
      final expiresAt = subscription is Map
          ? '${subscription["expires_at"] ?? ""}'.trim()
          : '';
      return (error: null, expiresAt: expiresAt.isEmpty ? null : expiresAt);
    } on ApiError catch (e) {
      return (error: e.message, expiresAt: null);
    } catch (_) {
      return (error: "Could not reach the server.", expiresAt: null);
    }
  }

  /* ── chat (same endpoints as web chatService) ── */

  static Future<List<Map<String, dynamic>>> chatMessages(
    int participantId,
  ) async {
    try {
      final data = await _get("/chat/messages/$participantId?markSeen=1");
      final list = _unwrapList(data, ["messages", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  /// POST /chat/messages — supports every type the web sends plus reply-to.
  static Future<bool> sendChatMessage(
    int receiverId,
    String text, {
    String type = "text",
    String? imageUrl,
    String? fileName,
    dynamic replyToId,
  }) async {
    try {
      await _post("/chat/messages", {
        "receiverId": receiverId,
        "type": type,
        if (text.isNotEmpty) "text": text,
        if (imageUrl != null && imageUrl.isNotEmpty) "image_url": imageUrl,
        if (fileName != null && fileName.isNotEmpty) "file_name": fileName,
        if (replyToId != null) "reply_to_id": replyToId,
        "client_message_id": "m-${DateTime.now().microsecondsSinceEpoch}",
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Forward an existing message to another participant (web forwardMessage —
  /// same POST /chat/messages endpoint, without reply_to).
  static Future<bool> forwardChatMessage(
    int receiverId,
    Map<String, dynamic> message,
  ) async {
    final type = (message["type"] ?? "text").toString();
    return sendChatMessage(
      receiverId,
      (message["text"] ?? message["message"] ?? "").toString(),
      type: type,
      imageUrl: (message["image_url"] ?? message["imageUrl"])?.toString(),
      fileName: (message["file_name"] ?? message["fileName"])?.toString(),
    );
  }

  /// DELETE /chat/messages {messageIds, mode} — mode: "me" | "everyone".
  static Future<bool> deleteChatMessages(
    List<dynamic> messageIds, {
    String mode = "me",
  }) async {
    if (messageIds.isEmpty) return false;
    try {
      await _deleteBody("/chat/messages", {
        "messageIds": messageIds,
        "mode": mode,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> hideConversation(int participantId) async {
    try {
      await _post("/chat/conversations/hide", {"participantId": participantId});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> unhideConversation(int participantId) async {
    try {
      await _post("/chat/conversations/unhide", {
        "participantId": participantId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Ids of everyone the viewer has blocked — `GET /auth/user/{id}/blocked`,
  /// the same list the web feed filters against. Returned as strings because
  /// feed items expose owner ids in several shapes.
  static Future<Set<String>> blockedUserIds() async {
    final me = currentUserId.trim();
    if (!loggedIn || me.isEmpty) return <String>{};
    try {
      final data = await _get("/auth/user/$me/blocked");
      final list = _unwrapList(data, [
        "blockedUsers",
        "users",
        "data",
        "items",
      ]);
      final ids = <String>{};
      for (final entry in list.whereType<Map>()) {
        for (final key in const ["id", "user_id", "blocked_user_id"]) {
          final value = "${entry[key] ?? ''}".trim();
          if (value.isNotEmpty) ids.add(value);
        }
      }
      return ids;
    } catch (_) {
      return <String>{};
    }
  }

  static Future<List<Map<String, dynamic>>> blockedChatUsers() async {
    try {
      final data = await _get("/chat/blocked-users");
      final list = _unwrapList(data, ["users", "blocked", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /* ── chat calls (web chatService call APIs) ── */

  static Future<Map<String, dynamic>?> startCall(
    int receiverId,
    String callType, {
    Map<String, dynamic>? offer,
  }) async {
    final result = await startCallDetailed(receiverId, callType, offer: offer);
    return result.call;
  }

  static Future<({Map<String, dynamic>? call, String? error})>
  startCallDetailed(
    int receiverId,
    String callType, {
    Map<String, dynamic>? offer,
  }) async {
    try {
      final data = await _post("/chat/calls/start", {
        "receiverId": receiverId,
        "callType": callType,
        "offer": offer ?? const {},
      });
      return (
        call: _asMap(
          data is Map ? (data["call"] ?? data["data"] ?? data) : data,
        ),
        error: null,
      );
    } on ApiError catch (e) {
      return (call: null, error: e.message);
    } catch (_) {
      return (call: null, error: "Failed to start call.");
    }
  }

  static Future<List<Map<String, dynamic>>> incomingCalls() async {
    try {
      final data = await _get("/chat/calls/incoming");
      final list = _unwrapList(data, ["calls", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<bool> acceptCall(
    dynamic callId, {
    Map<String, dynamic>? answer,
  }) async {
    try {
      await _post("/chat/calls/$callId/accept", {"answer": answer ?? const {}});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> rejectCall(dynamic callId) async {
    try {
      await _post("/chat/calls/$callId/reject", {});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> completeCall(dynamic callId, String status) async {
    try {
      await _post("/chat/calls/$callId/complete", {"status": status});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<List<Map<String, dynamic>>> callHistory(
    int participantId,
  ) async {
    try {
      final data = await _get("/chat/calls/history/$participantId");
      final list = _unwrapList(data, ["calls", "history", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<List<Map<String, dynamic>>> callSummaries() async {
    try {
      final data = await _get("/chat/calls/summaries");
      final list = _unwrapList(data, ["summaries", "calls", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /* ── account security (web settings) ── */

  /// POST /auth/security/request-otp — OTP before a sensitive action.
  static Future<(String?, String?)> requestAccountSecurityOtp(
    String purpose, {
    String destinationType = "email",
  }) async {
    try {
      final data = await _post("/auth/security/request-otp", {
        "purpose": purpose,
        "destinationType": destinationType,
      });
      return (null, data?["debugOtp"]?.toString());
    } on ApiError catch (e) {
      return (e.message, null);
    } catch (_) {
      return ("Could not reach the server.", null);
    }
  }

  /// Returns `(error, securityToken)`. Every protected action below consumes
  /// that one-shot token, so a caller that throws it away can never save.
  static Future<(String?, String?)> verifyAccountSecurityOtp(
    String purpose,
    String otp,
  ) async {
    try {
      final data = await _post("/auth/security/verify-otp", {
        "purpose": purpose,
        "otp": otp,
      });
      return (null, data?["securityToken"]?.toString());
    } on ApiError catch (e) {
      return (e.message, null);
    } catch (_) {
      return ("Could not reach the server.", null);
    }
  }

  /// POST /auth/security/change-email — save the new login email once the OTP
  /// for the current one has been verified.
  static Future<String?> changeLoginEmailWithOtp(
    String newEmail,
    String securityToken,
  ) async {
    try {
      await _post("/auth/security/change-email", {
        "newEmail": newEmail,
        "securityToken": securityToken,
      });
      await refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /auth/security/reset-password — set a new password after OTP.
  static Future<String?> resetPasswordWithSecurityOtp(
    String password,
    String securityToken,
  ) async {
    try {
      await _post("/auth/security/reset-password", {
        "newPassword": password,
        "securityToken": securityToken,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /auth/security/passkey — save (or clear) the 6-digit passkey.
  static Future<String?> savePasskeyWithOtp(
    String passkey,
    String securityToken,
  ) async {
    try {
      await _post("/auth/security/passkey", {
        "passkey": passkey,
        "securityToken": securityToken,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /auth/security/two-factor-phone — the web's 2FA panel. The country
  /// triple is not decoration: the backend rejects the request unless country
  /// code, country name and dial code all arrive with the number.
  static Future<String?> saveTwoFactorPhone({
    required String emailSecurityToken,
    required String countryCode,
    required String countryName,
    required String dialCode,
    required String phoneNumber,
    String otpDeliveryMethod = "email",
  }) async {
    try {
      await _post("/auth/security/two-factor-phone", {
        "emailSecurityToken": emailSecurityToken,
        "countryCode": countryCode,
        "countryName": countryName,
        "dialCode": dialCode,
        "phoneNumber": phoneNumber,
        "otpDeliveryMethod": otpDeliveryMethod,
      });
      await refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  // `updateOtpDelivery` used to live here. It posted `method`/`phone` while the
  // backend reads `otpDeliveryMethod` (authController.js), so it silently reset
  // delivery to email and dropped the number. The web sets both through
  // `/auth/security/two-factor-phone`, which `saveTwoFactorPhone` now does.

  /// GET /auth/sessions/history — sign-in history behind Security Alerts.
  static Future<List<Map<String, dynamic>>> authSessionHistory() async {
    try {
      final data = await _get("/auth/sessions/history");
      final list = _unwrapList(data, ["history", "sessions", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// PATCH /auth/sessions/{id} — rename or trust a device.
  static Future<bool> updateAuthSession(
    String id, {
    bool? trusted,
    String? deviceName,
  }) async {
    try {
      await _patch("/auth/sessions/${Uri.encodeComponent(id)}", {
        if (trusted != null) "trusted": trusted,
        if (deviceName != null) "deviceName": deviceName,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── P2P sell ads (web dashboard/wallet/sell) ── */

  /// GET /p2p-sell-ads — the marketplace of coin sell ads.
  static Future<List<Map<String, dynamic>>> sellAds() async {
    try {
      final data = await _get("/p2p-sell-ads");
      final list = _unwrapList(data, ["ads", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// GET /p2p-sell-ads/transactions — my buy/sell transactions.
  static Future<List<Map<String, dynamic>>> sellTransactions() async {
    if (!loggedIn) return const [];
    try {
      final data = await _get("/p2p-sell-ads/transactions");
      final list = _unwrapList(data, ["transactions", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// POST /p2p-sell-ads — create a sell ad. Returns null on success.
  static Future<String?> createSellAd(Map<String, dynamic> body) async {
    if (!loggedIn) return "Please log in to create a sell ad.";
    try {
      await _post("/p2p-sell-ads", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> updateSellAd(
    dynamic id,
    Map<String, dynamic> body,
  ) async {
    try {
      await _put("/p2p-sell-ads/$id", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<bool> deleteSellAd(dynamic id) async {
    try {
      await _delete("/p2p-sell-ads/$id");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /p2p-sell-ads/{id}/{lock|unlock|cancel|complete}
  static Future<String?> sellAdAction(dynamic id, String action) async {
    try {
      await _post("/p2p-sell-ads/$id/$action", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /p2p-sell-ads/{id}/start — begin buying from a sell ad.
  static Future<String?> startSellAdTrade(
    dynamic id,
    Map<String, dynamic> body,
  ) async {
    if (!loggedIn) return "Please log in to trade.";
    try {
      await _post("/p2p-sell-ads/$id/start", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /p2p-sell-ads/transactions/{id}/{confirm|cancel}
  static Future<String?> sellTransactionAction(
    dynamic transactionId,
    String action,
  ) async {
    try {
      await _post("/p2p-sell-ads/transactions/$transactionId/$action", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /p2p-sell-ads/transactions/{id}/report
  static Future<String?> reportSellTransaction(
    dynamic transactionId,
    String reason,
    String details,
  ) async {
    try {
      await _post("/p2p-sell-ads/transactions/$transactionId/report", {
        "reason": reason,
        "details": details,
        "custom_text": details,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> submitSellTransactionDetails(
    dynamic transactionId, {
    required String txId,
    ApiUploadFile? screenshot,
  }) async {
    try {
      final body = <String, dynamic>{
        if (txId.trim().isNotEmpty) "tx_id": txId.trim(),
      };
      if (screenshot != null) {
        await _multipart(
          "POST",
          "/p2p-sell-ads/transactions/$transactionId/submit-details",
          body,
          [screenshot.withField("screenshot")],
        );
      } else {
        await _post(
          "/p2p-sell-ads/transactions/$transactionId/submit-details",
          body,
        );
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── P2P buy ads (web dashboard/wallet/topup) ──
     `p2pAds.js` and `p2pSellAds.js` are near-identical buy/sell halves of the
     same machine (06-WALLET §3), so this mirrors the sell surface exactly. ── */

  static Future<List<Map<String, dynamic>>> buyAds() async {
    try {
      final data = await _get("/p2p-ads");
      final list = _unwrapList(data, ["ads", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<List<Map<String, dynamic>>> buyAdTransactions() async {
    try {
      final data = await _get("/p2p-ads/transactions");
      final list = _unwrapList(data, ["transactions", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<String?> createBuyAd(Map<String, dynamic> body) async {
    try {
      await _post("/p2p-ads", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> updateBuyAd(
    dynamic id,
    Map<String, dynamic> body,
  ) async {
    try {
      await _put("/p2p-ads/$id", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<bool> deleteBuyAd(dynamic id) async {
    try {
      await _delete("/p2p-ads/$id");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /p2p-ads/{id}/{lock|unlock|cancel|complete}
  static Future<String?> buyAdAction(dynamic id, String action) async {
    try {
      await _post("/p2p-ads/$id/$action", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> startBuyAdTrade(
    dynamic id,
    Map<String, dynamic> body,
  ) async {
    try {
      await _post("/p2p-ads/$id/start", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> submitBuyTransactionDetails(
    dynamic transactionId, {
    required String txId,
    ApiUploadFile? screenshot,
  }) async {
    try {
      final body = <String, dynamic>{
        if (txId.trim().isNotEmpty) "tx_id": txId.trim(),
      };
      if (screenshot != null) {
        await _multipart(
          "POST",
          "/p2p-ads/transactions/$transactionId/submit-details",
          body,
          [screenshot.withField("screenshot")],
        );
      } else {
        await _post(
          "/p2p-ads/transactions/$transactionId/submit-details",
          body,
        );
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> confirmBuyTransaction(dynamic transactionId) async {
    try {
      await _post("/p2p-ads/transactions/$transactionId/confirm", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> cancelBuyTransaction(dynamic transactionId) async {
    try {
      await _post("/p2p-ads/transactions/$transactionId/cancel", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> reportBuyTransaction(
    dynamic transactionId,
    String reason,
    String details,
  ) async {
    try {
      await _post("/p2p-ads/transactions/$transactionId/report", {
        "reason": reason,
        "details": details,
        "custom_text": details,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── coin requests (web wallet/request) ── */

  /// GET /coin-requests/my — my submitted requests and their review state.
  static Future<List<Map<String, dynamic>>> myCoinRequests() async {
    try {
      final data = await _get("/coin-requests/my");
      final list = _unwrapList(data, ["requests", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// POST /coin-requests — submit a coin request for admin approval.
  static Future<String?> createCoinRequest(Map<String, dynamic> body) async {
    if (!loggedIn) return "Please log in to request coins.";
    try {
      await _post("/coin-requests", body);
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── identity verification (web wallet/verification) ── */

  /// POST /verification/submit — KYC documents. Files ride as multipart when
  /// present, matching the web form.
  static Future<String?> submitVerification(
    Map<String, dynamic> body, {
    List<ApiUploadFile> documents = const [],
  }) async {
    if (!loggedIn) return "Please log in to apply for verification.";
    try {
      if (documents.isEmpty) {
        await _post("/verification/submit", body);
      } else {
        await _multipart("POST", "/verification/submit", body, documents);
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// GET /coin-requests/active-topup-methods — payment methods for sell ads.
  static Future<List<Map<String, dynamic>>> activeTopupMethods() async {
    try {
      final data = await _get("/coin-requests/active-topup-methods");
      final list = _unwrapList(data, ["methods", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /* ── profile tabs (web dashboard/profile data sources) ── */

  /// GET /upload-content/public?userId= — a user's approved uploads.
  static Future<List<UploadContent>> userUploads(dynamic userId) async {
    if ("$userId".trim().isEmpty) return const [];
    try {
      final data = await _get(
        "/upload-content/public?userId=${Uri.encodeComponent("$userId")}",
      );
      return _parseUploadContents(data);
    } catch (_) {
      return const [];
    }
  }

  /// GET /upload-content/my — the signed-in user's own uploads (any status).
  static Future<List<UploadContent>> myUploads() async {
    if (!loggedIn) return const [];
    try {
      final data = await _get("/upload-content/my");
      return _parseUploadContents(data, includeUnapproved: true);
    } catch (_) {
      return const [];
    }
  }

  /// GET /ads/active-public?user_id= — a user's currently running ads.
  static Future<List<HomeAd>> userAds(dynamic userId) async {
    if ("$userId".trim().isEmpty) return const [];
    try {
      return await activeAds(userId: "$userId", filterForViewer: false);
    } catch (_) {
      return const [];
    }
  }

  /// GET /ads/saves — the signed-in user's saved ads.
  static Future<List<Map<String, dynamic>>> savedAds() async {
    if (!loggedIn) return const [];
    try {
      final data = await _get("/ads/saves");
      final list = _unwrapList(data, ["ads", "saves", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// GET /ads/saved-public/{userId} — another user's public saved ads.
  /// Complete bookmark state, including completed saves filtered from cards.
  /// GET /ads/saves/counts - the same save counters and plan limits used by
  /// the web profile before it attempts to bookmark a photo/video ad.
  static Future<Map<String, dynamic>?> savedAdCounts() async {
    if (!loggedIn) return null;
    try {
      final data = await _get('/ads/saves/counts');
      if (data is! Map || data['success'] == false) return null;
      final counts = data['counts'];
      final limits = data['limits'];
      if (counts is! Map || limits is! Map) return null;
      return {
        'counts': Map<String, dynamic>.from(counts),
        'limits': Map<String, dynamic>.from(limits),
      };
    } catch (_) {
      return null;
    }
  }

  static Future<Set<String>> savedAdIds() async {
    if (!loggedIn) return const <String>{};
    try {
      final data = await _get("/ads/saves/ids");
      final list = _unwrapList(data, ["savedAdIds", "ids", "data", "items"]);
      return list
          .map((value) => '$value'.replaceFirst(RegExp(r'^ad-'), '').trim())
          .where((value) => value.isNotEmpty)
          .toSet();
    } catch (_) {
      return const <String>{};
    }
  }

  static Future<List<Map<String, dynamic>>> publicSavedAds(
    dynamic userId,
  ) async {
    if ("$userId".trim().isEmpty) return const [];
    try {
      final data = await _get(
        "/ads/saved-public/${Uri.encodeComponent("$userId")}",
      );
      final list = _unwrapList(data, ["ads", "saves", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// POST /ads/{id}/save — toggle an ad bookmark.
  static Future<bool> toggleAdSave(dynamic adId) async {
    final result = await toggleAdSaveDetailed(adId);
    return result.success;
  }

  static Future<({bool success, String? error, bool? saved})>
  toggleAdSaveDetailed(dynamic adId) async {
    if (!loggedIn) {
      return (success: false, error: "Please log in to save ads.", saved: null);
    }
    try {
      final data = await _post(
        "/ads/${"$adId".replaceFirst(RegExp(r"^ad-"), "")}/save",
        {},
      );
      final saved = data is Map
          ? (data["saved"] == true || data["isSaved"] == true)
          : null;
      return (success: true, error: null, saved: saved);
    } on ApiError catch (e) {
      return (success: false, error: e.message, saved: null);
    } catch (_) {
      return (
        success: false,
        error: "Could not reach the server.",
        saved: null,
      );
    }
  }

  /// GET /auth/user/{id}/subscription — social follow/subscription status.
  static Future<Map<String, dynamic>?> subscriptionStatus(
    dynamic userId,
  ) async {
    try {
      final data = await _get("/auth/user/$userId/subscription");
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  /// GET /chat/support-assignment — the admin assigned to this user's support chat.
  static Future<Map<String, dynamic>?> supportAssignment() async {
    try {
      final data = await _get("/chat/support-assignment");
      return _asMap(
        data is Map ? (data["assignment"] ?? data["data"] ?? data) : data,
      );
    } catch (_) {
      return null;
    }
  }

  /* ── market engagement ── */

  static Future<void> toggleProductLike(int id) async {
    try {
      await _post("/market/$id/like", {});
    } catch (_) {}
  }

  /* ── withdrawals (web dashboard/wallet/withdrawal) ── */

  /// GET /withdrawals/payment-methods → [{id, name, icon, fields:[…]}]
  static Future<List<Map<String, dynamic>>> withdrawalPaymentMethods() async {
    try {
      final data = await _get("/withdrawals/payment-methods");
      final list = _unwrapList(data, ["methods", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// GET /withdrawals/my-requests → the viewer's withdrawal history.
  static Future<List<Map<String, dynamic>>> myWithdrawalRequests() async {
    if (!loggedIn) return const [];
    try {
      final data = await _get("/withdrawals/my-requests");
      final list = _unwrapList(data, ["requests", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// GET /withdrawal-admin/settings → {min_amount, max_amount, coin_rate}.
  static Future<Map<String, dynamic>> withdrawalSettings() async {
    try {
      final data = await _get("/withdrawal-admin/settings");
      return _asMap(
            data is Map ? (data["settings"] ?? data["data"] ?? data) : data,
          ) ??
          {};
    } catch (_) {
      return {};
    }
  }

  /// POST /withdrawals/request. Returns null on success, else the backend's
  /// message (unverified account, below minimum, insufficient balance…).
  static Future<String?> createWithdrawalRequest({
    required dynamic paymentMethodId,
    required double amount,
    required Map<String, String> paymentDetails,
  }) async {
    if (!loggedIn) return "Please log in to withdraw.";
    try {
      await _post("/withdrawals/request", {
        "payment_method_id": paymentMethodId,
        "amount": amount,
        "payment_details": paymentDetails,
      });
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// DELETE /withdrawals/cancel/{id} — refunds the held amount.
  static Future<String?> cancelWithdrawalRequest(dynamic id) async {
    try {
      await _delete("/withdrawals/cancel/$id");
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// GET /verification/status → the KYC state gating withdrawals.
  static Future<Map<String, dynamic>> verificationStatus() async {
    if (!loggedIn) return {};
    try {
      final data = await _get("/verification/status");
      return _asMap(data is Map ? (data["data"] ?? data) : data) ?? {};
    } catch (_) {
      return {};
    }
  }

  /* ── wallet transfer (same as web walletService.directTransfer) ── */

  /// GET /auth/search-users — people search for the Googs search box.
  /// The backend excludes staff/support accounts, deactivated/deleted users and
  /// anyone blocked in either direction, so results match the web exactly.
  static Future<List<Map<String, dynamic>>> searchPeople(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty || !loggedIn) return const [];
    try {
      final data = await _get(
        "/auth/search-users?query=${Uri.encodeComponent(trimmed)}",
      );
      final list = _unwrapList(data, ["users", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<List<Map<String, dynamic>>> searchWalletUsers(
    String query,
  ) async {
    try {
      final data = await _get(
        "/wallet/search-users?query=${Uri.encodeComponent(query)}",
      );
      final list = _unwrapList(data, ["users", "data", "items"]);
      final me = currentUserId.trim();
      final myGoogerId = googerId.trim();
      return list.map((e) => Map<String, dynamic>.from(e as Map)).where((
        candidate,
      ) {
        final id = '${candidate["id"] ?? ''}'.trim();
        final publicId =
            '${candidate["user_id"] ?? candidate["googer_id"] ?? ''}'.trim();
        return (me.isEmpty || id != me) &&
            (myGoogerId.isEmpty || publicId != myGoogerId);
      }).toList();
    } catch (_) {
      return [];
    }
  }

  /// Uses the same security check as the web wallet confirmation modal.
  static Future<String?> verifyPassword(String password) async {
    try {
      await _post('/auth/verify-password', {'password': password});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return 'Could not verify the password.';
    }
  }

  static Future<String?> walletTransfer(
    int receiverId,
    double amount,
    String note, {
    double commissionPercentage = 0,
  }) async {
    try {
      await _post("/wallet/transfer", {
        "receiverId": receiverId,
        "amount": amount,
        "note": note,
        "commissionPercentage": commissionPercentage,
      });
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── wallet ── */

  /// Raw statement rows. [walletHistory] flattens each row into a [Tx], which
  /// drops the note, badge and counter-party id the My Wallet tabs render — so
  /// those read the untouched maps instead.
  static Future<List<Map<String, dynamic>>> walletHistoryRaw() async {
    try {
      final data = await _get("/wallet/history");
      final list = _unwrapList(data, ["transactions", "data", "history"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// GET /auth/wallet — live referral totals, configured levels and rows.
  static Future<Map<String, dynamic>> walletReferralData({
    bool includeReferrals = true,
  }) async {
    try {
      final data = await _get(
        '/auth/wallet?include_referrals=${includeReferrals ? 'true' : 'false'}&limit=200',
      );
      return data is Map ? Map<String, dynamic>.from(data) : const {};
    } catch (_) {
      return const {};
    }
  }

  static Future<List<Tx>> walletHistory() async {
    try {
      final data = await _get("/wallet/history");
      final list = _unwrapList(data, ["transactions", "data", "history"]);
      final myId = "${user?["id"] ?? ""}";
      return list.map<Tx>((raw) {
        final m = Map<String, dynamic>.from(raw as Map);
        final sent = "${m["sender_id"]}" == myId;
        return Tx(
          int.tryParse("${m["id"]}") ?? 0,
          (m["type"] ?? (sent ? "sent" : "received")).toString(),
          "@${(sent ? m["receiver_username"] : m["sender_username"]) ?? "user"}",
          double.tryParse("${m["amount"] ?? 0}") ?? 0,
          (m["created_at"] ?? "").toString().split("T").first,
          (m["status"] ?? "completed").toString(),
        );
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  /* ── goog create / edit / delete (web googService.createPost etc.) ── */

  static Future<String?> createGoog(String text, String textColorHex) async {
    try {
      await _post("/googs", {"text": text, "textColor": textColorHex});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> updateGoog(
    int id,
    String text,
    String textColorHex,
  ) async {
    try {
      await _put("/googs/$id", {"text": text, "textColor": textColorHex});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<bool> deleteGoog(int id) async {
    try {
      await _delete("/googs/$id");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /upload-content/{id}/pin — toggle pin on own upload content.
  static Future<bool> toggleUploadPin(int id) async {
    if (!loggedIn) return false;
    try {
      await _post("/upload-content/$id/pin", {});
      return true;
    } catch (_) {
      return false;
    }
  }

  /// DELETE /upload-content/{id} — delete own upload content.
  static Future<bool> deleteUploadContent(int id) async {
    if (!loggedIn) return false;
    try {
      await _delete("/upload-content/$id");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Toggle bookmark — POST /googs/{id}/save. Returns saved state or null on error.
  static Future<bool?> toggleGoogSave(int id) async {
    try {
      final r = await _post("/googs/$id/save", {});
      if (r is Map) return r["saved"] == true || r["isSaved"] == true;
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Subscribe to the goog's author — POST /googs/{id}/subscribe
  static Future<bool?> toggleGoogSubscribe(int id) async {
    try {
      final r = await _post("/googs/$id/subscribe", {});
      if (r is Map) return r["subscribed"] == true || r["isSubscribed"] == true;
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> deleteGoogComment(int commentId) async {
    try {
      await _delete("/googs/comments/$commentId");
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> reportGoogComment(int commentId, String reason) async {
    try {
      await _post("/googs/comments/$commentId/report", {"reason": reason});
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Googs written by one user — GET /googs/user/{userId}
  static Future<List<GoogPost>> userGoogs(dynamic userId) async {
    try {
      final data = await _get("/googs/user/$userId");
      final list = _unwrapList(data, ["posts", "data", "googs", "items"]);
      return list
          .map<GoogPost>(
            (raw) => parseGoog(Map<String, dynamic>.from(raw as Map)),
          )
          .toList();
    } catch (_) {
      return [];
    }
  }

  /* ── users / public profiles (web authService) ── */

  static Future<Map<String, dynamic>?> userById(dynamic id) async {
    try {
      final data = await _get("/auth/user/$id");
      return _unwrapUser(data);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> userByUsername(String username) async {
    try {
      final data = await _get(
        "/auth/username/${Uri.encodeComponent(username)}",
      );
      return _unwrapUser(data);
    } catch (_) {
      return null;
    }
  }

  static Future<List<Map<String, dynamic>>> _userList(String path) async {
    try {
      final data = await _get(path);
      final list = _unwrapList(data, [
        "users",
        "followers",
        "following",
        "data",
        "views",
      ]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> followers(dynamic userId) =>
      _userList("/auth/user/$userId/followers");
  static Future<List<Map<String, dynamic>>> following(dynamic userId) =>
      _userList("/auth/user/$userId/following");
  static Future<List<Map<String, dynamic>>> profileViews(dynamic userId) =>
      _userList("/auth/user/$userId/views");

  /// Follow / unfollow a user — POST /auth/user/{id}/subscribe
  static Future<bool?> toggleUserSubscription(dynamic userId) async {
    try {
      final r = await _post("/auth/user/$userId/subscribe", {});
      if (r is Map) {
        return r["subscribed"] == true ||
            r["isSubscribed"] == true ||
            r["is_subscribed"] == true ||
            r["following"] == true;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> isSubscribedTo(dynamic userId) async {
    try {
      final r = await _get("/auth/user/$userId/subscription");
      return r is Map &&
          (r["subscribed"] == true ||
              r["isSubscribed"] == true ||
              r["is_subscribed"] == true);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isSubscribedToGoog(int googId) async {
    try {
      final r = await _get("/googs/$googId/subscribe");
      return r is Map &&
          (r["subscribed"] == true ||
              r["isSubscribed"] == true ||
              r["is_subscribed"] == true);
    } catch (_) {
      return false;
    }
  }

  static Future<void> logProfileView(dynamic userId) async {
    try {
      await _post("/auth/user/$userId/view", {});
    } catch (_) {}
  }

  static Future<bool> toggleBlockUser(dynamic userId) async {
    try {
      await _post("/auth/user/$userId/block", {});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> reportUser(dynamic userId, String reason) async {
    try {
      await _post("/auth/user/$userId/report", {"reason": reason});
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Verified-badge data by plan/admin approval — GET /subscriptions/badge/{userId}
  static Future<Map<String, dynamic>?> badgeForUser(dynamic userId) async {
    final id = "$userId".trim();
    if (id.isEmpty) return null;
    try {
      final r = await _get("/subscriptions/badge/$id");
      if (r is! Map) return null;
      final badge = r["badge"];
      if (badge is Map) return Map<String, dynamic>.from(badge);
      final tier = r["tier"] ?? r["badge_color"] ?? r["color"];
      if (tier == null || "$tier".trim().isEmpty) return null;
      return {
        "color": tier.toString(),
        "tickColor": r["tickColor"] ?? r["tick_color"],
      };
    } catch (_) {
      return null;
    }
  }

  /* ── wallet requests (web walletService.requestMoney / respond / cancel) ── */

  static Future<String?> requestMoney(
    int receiverId,
    double amount,
    String note, {
    double commissionPercentage = 0,
    String type = 'request',
  }) async {
    try {
      await _post("/wallet/request", {
        "receiverId": receiverId,
        "amount": amount,
        "note": note,
        "commissionPercentage": commissionPercentage,
        "type": type,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// Creates the seller-locked hold used by manual checkout.
  static Future<Map<String, dynamic>> createManualOrderHold({
    required int receiverId,
    required double amount,
  }) async {
    final data = await _post('/wallet/request', {
      'receiverId': receiverId,
      'amount': amount,
      'note': 'Googer Manual Payment Hold',
      'commissionPercentage': 0,
      'type': 'sell',
      'manualPaymentOrder': true,
    });
    final payload = data is Map
        ? (data['transaction'] ?? data['transfer'])
        : null;
    if (payload is! Map) {
      throw ApiError(500, 'Manual payment did not return a transaction.');
    }
    refreshProfile();
    return Map<String, dynamic>.from(payload);
  }

  static Future<List<Map<String, dynamic>>> pendingRequests() async {
    try {
      final data = await _get("/wallet/pending-requests");
      final list = _unwrapList(data, ["requests", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  /// action: accept | reject
  static Future<String?> respondToRequest(int requestId, String action) async {
    try {
      await _post("/wallet/respond", {
        "requestId": requestId,
        "action": action,
      });
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> cancelTransaction(int transactionId) async {
    try {
      await _post("/wallet/cancel", {"transactionId": transactionId});
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── subscription plans (web subscriptionService) ── */

  static Future<List<Map<String, dynamic>>> publicPlans() async {
    try {
      final data = await _get("/admin/customization/subscription-plans/public");
      final list = _unwrapList(data, ["plans", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> mySubscription() async {
    try {
      final data = await _get("/subscriptions/me");
      final sub = data is Map ? (data["subscription"] ?? data) : null;
      return sub is Map ? Map<String, dynamic>.from(sub) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> myPlan() async {
    try {
      final data = await _get("/subscription-plans/my");
      if (data is! Map) return null;
      final raw = data["data"] ?? data["plan"] ?? data;
      if (raw is! Map) return null;
      final plan = Map<String, dynamic>.from(raw);
      plan["is_basic"] = data["is_basic"] ?? plan["is_basic"];
      return plan;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> myFeatures() async {
    try {
      final data = await _get("/subscriptions/features");
      final features = data is Map ? (data["features"] ?? data) : null;
      return features is Map ? Map<String, dynamic>.from(features) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> mySubscriptionUsage() async {
    try {
      final data = await _get("/subscriptions/my-usage");
      final usage = data is Map ? (data["usage"] ?? data) : null;
      return usage is Map ? Map<String, dynamic>.from(usage) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> subscribePlan(
    int planId, {
    bool switchPlan = false,
  }) async {
    try {
      await _post("/subscriptions/subscribe", {
        "plan_id": planId,
        "switch_plan": switchPlan,
      });
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<bool> setAutoRenew(bool autoRenew) async {
    try {
      await _patch("/subscriptions/auto-renew", {"auto_renew": autoRenew});
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── market engagement (web marketService) ── */

  static Future<List<Map<String, dynamic>>> productComments(int id) async {
    try {
      final data = await _get("/market/$id/comments");
      final list = _unwrapList(data, ["comments", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<bool> addProductComment(
    int id,
    String text, {
    dynamic parentId,
  }) async {
    try {
      await _post("/market/$id/comments", {
        "text": text,
        "comment": text,
        if (parentId != null) "parent_id": parentId,
        if (parentId != null) "parentId": parentId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<int?> markProductView(int id) async {
    try {
      final data = await _post("/market/$id/view", {});
      return int.tryParse(
        '${data?["views_count"] ?? data?["viewCount"] ?? data?["views"] ?? ''}',
      );
    } catch (_) {
      return null;
    }
  }

  static Future<int?> shareProduct(int id, {int? currentCount}) async {
    try {
      final data = await _post("/market/$id/share", {});
      return resolveShareCountResponse(data, currentCount: currentCount);
    } catch (_) {
      return null;
    }
  }

  static Future<bool> reportProduct(
    int id,
    String reason,
    String details,
  ) async {
    try {
      await _post("/market/$id/report", {"reason": reason, "details": details});
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── chat presence / typing / blocking (web chatService) ── */

  static Future<void> updatePresence({int? activeParticipantId}) async {
    try {
      await _post("/chat/presence", {
        "activeParticipantId": activeParticipantId,
      });
    } catch (_) {}
  }

  static Future<void> sendTyping() async {
    try {
      await _post("/chat/typing", {});
    } catch (_) {}
  }

  static Future<bool> peerTyping(int participantId) async {
    try {
      final r = await _get("/chat/typing/$participantId");
      return r is Map && (r["typing"] == true || r["isTyping"] == true);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> blockChatUser(int userId) async {
    try {
      await _post("/chat/block", {"userId": userId});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> unblockChatUser(int userId) async {
    try {
      await _post("/chat/unblock", {"userId": userId});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> deleteConversation(int participantId) async {
    try {
      await _delete("/chat/conversations/$participantId");
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── notifications ── */

  static Future<List<Map<String, dynamic>>> notifications() async {
    try {
      final data = await _get("/notifications");
      final list = _unwrapList(data, ["notifications", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> markAllNotificationsRead() async {
    try {
      await _post("/notifications/read-all", {});
    } catch (_) {}
  }

  /* ── account & security (web authService) ── */

  static Future<String?> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    try {
      await _post("/auth/change-password", {
        "currentPassword": currentPassword,
        "newPassword": newPassword,
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<bool?> checkUsername(String username) async {
    try {
      final r = await _get(
        "/auth/check-username?username=${Uri.encodeComponent(username)}",
      );
      return r is Map ? r["available"] == true : null;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> updateProfile(
    Map<String, dynamic> fields, {
    ApiUploadFile? profilePhoto,
  }) async {
    try {
      dynamic data;
      if (profilePhoto == null) {
        data = await _put("/auth/update-profile", fields);
      } else {
        data = await _multipart("PUT", "/auth/update-profile", fields, [
          profilePhoto.withField("profile_picture_file"),
        ]);
      }
      if (profilePhoto != null || fields.containsKey("profilePicture")) {
        _avatarRevision++;
      }
      final updatedUser = _unwrapUser(data);
      if (updatedUser != null) {
        user = {...?user, ...updatedUser};
        _persistAuth();
        profileRevision.value++;
      } else {
        // The update endpoint normally returns the saved user. Only fall back
        // to GET /auth/profile when it does not; an immediate cached GET can
        // otherwise replace a newly uploaded avatar with the previous URL.
        await refreshProfile();
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<List<Map<String, dynamic>>> authSessions() async {
    try {
      final data = await _get("/auth/sessions");
      final list = _unwrapList(data, ["sessions", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<bool> logoutOtherSessions() async {
    try {
      await _post("/auth/sessions/logout-others", {});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> removeSession(String id) async {
    try {
      await _delete("/auth/sessions/${Uri.encodeComponent(id)}");
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<String?> selfDeactivate() async {
    try {
      await _post("/auth/self-deactivate", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> selfDelete() async {
    try {
      await _post("/auth/self-delete", {});
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── shop / marketplace (web marketService.getProducts + pagination) ── */

  /// Paging state populated by [shopProductsRaw] (web marketService pagination).
  static int shopNextOffset = 0;
  static bool shopHasMore = false;

  /// GET `/market/products?<filters>` — raw product maps + pagination.
  /// Returns the same `product: any` shape the web SharedProductCard/quick-view use.
  static Future<List<Map<String, dynamic>>> shopProductsRaw({
    String search = "",
    String category = "",
    String subCategory = "",
    String level3 = "",
    String country = "",
    String sort = "",
    String algorithm = "recommended",
    String status = "",
    String shuffle = "",
    String feedSession = "",
    List<String> seenProductIds = const [],
    List<String> lastShownOrderIds = const [],
    int limit = 20,
    int offset = 0,
  }) async {
    final params = <String, String>{"limit": "$limit", "offset": "$offset"};
    if (search.trim().isNotEmpty) params["search"] = search.trim();
    if (category.isNotEmpty && category.toLowerCase() != "all") {
      params["category"] = category;
    }
    if (subCategory.isNotEmpty) params["subCategory"] = subCategory;
    if (level3.isNotEmpty) params["level3"] = level3;
    if (country.isNotEmpty) params["country"] = country;
    if (sort.isNotEmpty) params["sort"] = sort;
    if (algorithm.isNotEmpty) params["algorithm"] = algorithm;
    if (status.isNotEmpty) params["status"] = status;
    if (shuffle.isNotEmpty) params["_shuffle"] = shuffle;
    if (feedSession.isNotEmpty) params["_feedSession"] = feedSession;
    if (seenProductIds.isNotEmpty) {
      params["_seen"] = seenProductIds.join(",");
    }
    if (lastShownOrderIds.isNotEmpty) {
      params["_lastOrder"] = lastShownOrderIds.join(",");
    }
    final qs = params.entries
        .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
        .join("&");
    try {
      final data = await _get("/market/products?$qs");
      final list = _unwrapList(data, ["data", "products", "items"]);
      final pag = data is Map ? _asMap(data["pagination"]) : null;
      shopNextOffset =
          int.tryParse("${pag?["nextOffset"] ?? (offset + limit)}") ??
          (offset + limit);
      shopHasMore = pag?["hasMore"] == true;
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      shopHasMore = false;
      return const [];
    }
  }

  /// GET /market/{id} — a single product's full record (variants, sizes, shipping…).
  static Future<Map<String, dynamic>?> productById(dynamic id) async {
    final numeric = "$id".trim().replaceFirst(
      RegExp(r"^(ad|item|product|market|promo)-", caseSensitive: false),
      "",
    );
    if (numeric.isEmpty) return null;
    try {
      final data = await _get("/market/$numeric");
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> publicMarketAd(dynamic id) async {
    final value = "$id".trim().replaceFirst(
      RegExp(r"^ad-", caseSensitive: false),
      "",
    );
    if (value.isEmpty) return null;
    try {
      final data = await _get("/market/public/${Uri.encodeComponent(value)}");
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> publicProductByShareCode(
    String shareCode,
  ) async {
    final code = shareCode.trim();
    if (code.isEmpty) return null;
    try {
      final data = await _get(
        "/market/product/public/${Uri.encodeComponent(code)}",
      );
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> unifiedShareItem(
    String shareCode,
  ) async {
    final code = shareCode.trim();
    if (code.isEmpty) return null;
    try {
      final data = await _get(
        "/market/share-unified/${Uri.encodeComponent(code)}",
      );
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  /// POST /market/{id}/like — returns the new liked state (null on failure).
  static Future<bool?> toggleProductLikeState(dynamic id) async {
    if (!loggedIn) return null;
    try {
      final data = await _post("/market/$id/like", {});
      return data?["liked"] == true;
    } catch (_) {
      return null;
    }
  }

  /// GET /market/{id}/{likes|views|shares|comments} — engagement lists.
  static Future<List<Map<String, dynamic>>> productInteractions(
    dynamic id,
    String kind,
  ) async {
    try {
      final data = await _get("/market/$id/$kind");
      final list = _unwrapList(data, [kind, "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<Map<String, dynamic>?> likeProductComment(
    dynamic commentId,
  ) async {
    try {
      final data = await _post("/market/comments/$commentId/like", {});
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> dislikeProductComment(
    dynamic commentId,
  ) async {
    try {
      final data = await _post("/market/comments/$commentId/dislike", {});
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<bool> reportProductComment(
    dynamic commentId, [
    String reason = "Inappropriate content",
  ]) async {
    try {
      await _post("/market/comments/$commentId/report", {"reason": reason});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> deleteProductComment(dynamic commentId) async {
    try {
      await _delete("/market/comments/$commentId");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// GET /categories/tree — the full nested category tree for the drawer/chips.
  static Future<List<Map<String, dynamic>>> categoryTree() async {
    try {
      final data = await _get("/categories/tree?includeInactive=0");
      final list = _unwrapList(data, ["categories", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<double> globalCategoryCommission() async {
    try {
      final data = await _get("/categories/commission/global");
      return double.tryParse(
            '${data?["commissionPercentage"] ?? data?["setting_value"] ?? 0}',
          ) ??
          0;
    } catch (_) {
      return 0;
    }
  }

  static Future<bool> manualCategoryCommissionEnabled() async {
    try {
      final data = await _get("/categories/commission/manual-enabled");
      final value = data?["enabled"] ?? data?["setting_value"];
      if (value is bool) return value;
      return {'1', 'true', 'yes', 'on'}.contains('$value'.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  /// GET /market?user_id=me&status=… — my own listings for the My Listings tab.
  static Future<List<Map<String, dynamic>>> myProducts({
    String status = "",
  }) async {
    final me = currentUserId;
    if (me.isEmpty) return const [];
    final statusQuery = status.isEmpty || status.toLowerCase() == "all"
        ? ""
        : "&status=${Uri.encodeComponent(status)}";
    try {
      final data = await _get(
        "/market?user_id=${Uri.encodeComponent(me)}$statusQuery",
      );
      final list = _unwrapList(data, ["data", "items", "products"]);
      return list
          .whereType<Map>()
          .where((m) => m["is_sponsored"] != true)
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// POST /market/create — create a listing (text/variant fields).
  static Future<String?> createAd(
    Map<String, dynamic> body, {
    List<ApiUploadFile> media = const [],
  }) async {
    if (!loggedIn) return "Please log in to create an ad.";
    try {
      final files = media
          .take(5)
          .map((file) => file.withField("images"))
          .toList();
      if (files.isEmpty) {
        await _post("/ads", body);
      } else {
        await _multipart("POST", "/ads", body, files);
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<String?> updateAd(
    dynamic adId,
    Map<String, dynamic> body, {
    List<ApiUploadFile> media = const [],
  }) async {
    try {
      final files = media
          .take(5)
          .map((file) => file.withField("images"))
          .toList();
      if (files.isEmpty) {
        await _put("/ads/$adId", body);
      } else {
        await _multipart("PUT", "/ads/$adId", body, files);
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /* ── chat stickers (web chats page sticker picker) ── */

  /// GET /stickers/trending, or /stickers/search?q= for a named category.
  /// Rows without a `url` are dropped, matching the web filter.
  static Future<List<Map<String, dynamic>>> stickers({
    String category = 'trending',
  }) async {
    final path = category == 'trending'
        ? "/stickers/trending"
        : "/stickers/search?q=${Uri.encodeComponent(category)}";
    // Throws on failure so the picker can tell "none found" apart from "the
    // request failed" — the endpoint is authenticated and returns 401 when the
    // session has lapsed, which otherwise looks like an empty pack.
    final data = await _get(path);
    final list = data is Map
        ? (data["stickers"] ?? data["data"] ?? data["results"])
        : data;
    if (list is! List) return const [];
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => '${e["url"] ?? ""}'.isNotEmpty)
        .toList();
  }

  /* ── campaign builder configuration (web CampaignEditor) ── */

  /// GET /admin/customization/reach-tiers/public?ad_type=…
  ///
  /// The tiers drive the budget slider bounds, the Profile Promote package
  /// chips, the duration min/max, and the estimated-reach maths. An empty list
  /// means the admin has configured no packages, which the builder surfaces
  /// rather than falling back to invented numbers.
  static Future<List<Map<String, dynamic>>> reachTiers(String adType) async {
    try {
      final data = await _get(
        "/admin/customization/reach-tiers/public?ad_type=${Uri.encodeComponent(adType)}",
      );
      if (data is! List) return const [];
      return data
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// GET /admin/customization/ad-allowed-countries — ISO-2 codes the admin has
  /// enabled for one ad type (`photo_video`, `product_promote`,
  /// `profile_promote`).
  ///
  /// Returns null when the setting is absent or unreachable, which the web
  /// treats as "unrestricted"; an empty list genuinely means nothing is
  /// allowed. Those two cases must stay distinguishable.
  static Future<List<String>?> adAllowedCountries(String adTypeKey) async {
    try {
      final data = await _get("/admin/customization/ad-allowed-countries");
      final allowed = data is Map ? data["allowed_countries"] : null;
      if (allowed is! Map) return null;
      final codes = allowed[adTypeKey];
      if (codes is! List) return const [];
      return codes.map((c) => "$c".toUpperCase()).toList();
    } catch (_) {
      return null;
    }
  }

  /// Public country catalog used by wallet country pickers.
  static Future<List<Map<String, dynamic>>> countryCatalog() async {
    try {
      final data = await _get("/admin/customization/country-catalog");
      final list = _unwrapList(data, ["countries", "data", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  /// POST /promo-codes/validate — throws [ApiError] carrying the backend's
  /// reason ("expired", "usage limit reached", wrong ad type…), which the
  /// builder shows under the promo field.
  static Future<Map<String, dynamic>> validatePromoCode(
    String code,
    String adType,
  ) async {
    final data = await _post("/promo-codes/validate", {
      "code": code,
      "ad_type": adType,
    });
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  /// POST /promo-codes/redeem — increments `uses_count`. Called only after the
  /// ad is created, so a failed publish never burns a code.
  static Future<void> redeemPromoCode(
    String code,
    String adType,
    String adId,
  ) async {
    await _post("/promo-codes/redeem", {
      "code": code,
      "ad_type": adType,
      "ad_id": adId,
    });
  }

  /* ── campaign payment (web walletService) ── */

  /// POST /wallet/pay-profile-promote — Profile Promote has its own payment
  /// path, separate from `/wallet/pay-order`.
  static Future<void> walletPayProfilePromote(
    double amount, {
    String orderId = "",
    String note = "",
  }) async {
    await _post("/wallet/pay-profile-promote", {
      "amount": amount,
      if (orderId.isNotEmpty) "orderId": orderId,
      if (note.isNotEmpty) "note": note,
    });
  }

  /// POST /wallet/record-promo-ad — books a zero-value wallet entry so a fully
  /// discounted campaign still shows up in transaction history.
  static Future<void> walletRecordPromoAd(
    String adId, {
    String campaignType = "",
  }) async {
    await _post("/wallet/record-promo-ad", {
      "adId": adId,
      if (campaignType.isNotEmpty) "campaignType": campaignType,
    });
  }

  static Future<String?> createProduct(
    Map<String, dynamic> body, {
    List<ApiUploadFile> images = const [],
  }) async {
    if (!loggedIn) return "Please log in to list a product.";
    try {
      final files = images
          .take(5)
          .map((file) => file.withField("images"))
          .toList();
      if (files.isEmpty) {
        await _post("/market/create", body);
      } else {
        await _multipart("POST", "/market/create", body, files);
      }
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  static Future<bool> updateProduct(
    dynamic id,
    Map<String, dynamic> body, {
    List<ApiUploadFile> images = const [],
  }) async {
    try {
      final files = images
          .take(5)
          .map((file) => file.withField("images"))
          .toList();
      if (files.isEmpty) {
        await _put("/market/$id", body);
      } else {
        await _multipart("PUT", "/market/$id", body, files);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> deleteProduct(dynamic id) async {
    try {
      await _delete("/market/$id");
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> updateProductStatus(dynamic id, String status) async {
    try {
      await _put("/market/$id/status", {"status": status});
      return true;
    } catch (_) {
      return false;
    }
  }

  /// POST /market/{id}/video-watch-eligible — required before an ad coin collect.
  static Future<void> markAdVideoWatchEligible(
    dynamic id, {
    int watchedSeconds = 5,
  }) async {
    try {
      await _post("/market/$id/video-watch-eligible", {
        "watchedSeconds": watchedSeconds,
      });
    } catch (_) {}
  }

  /* ── orders (web orderService) ── */

  static Future<Map<String, dynamic>> orderBadgeCounts() async {
    try {
      final data = await _get("/orders/badge-counts");
      return _asMap(data is Map ? (data["data"] ?? data) : data) ?? {};
    } catch (_) {
      return {};
    }
  }

  static Future<List<Map<String, dynamic>>> buyerOrders({String status = ""}) =>
      _orders("buyer", status);

  static Future<List<Map<String, dynamic>>> sellerOrders({
    String status = "",
  }) => _orders("seller", status);

  static Future<List<Map<String, dynamic>>> _orders(
    String side,
    String status,
  ) async {
    final qs = status.isNotEmpty && status.toLowerCase() != "all"
        ? "?status=${Uri.encodeComponent(status)}"
        : "";
    try {
      final data = await _get("/orders/$side$qs");
      final list = _unwrapList(data, ["data", "orders", "items"]);
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// POST /orders/create — buy a single product. Returns null on success.
  static Future<String?> createOrder(Map<String, dynamic> body) async {
    if (!loggedIn) return "Please log in to place an order.";
    try {
      await _post("/orders/create", body);
      refreshProfile();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
  }

  /// POST /orders/create-bulk — checkout a grouped cart. Returns null on success.
  static Future<String?> createBulkOrder(Map<String, dynamic> body) async {
    final result = await createBulkOrderDetailed(body);
    return result.error;
  }

  /// Same call as [createBulkOrder] but also surfaces the order numbers the
  /// backend created, so checkout can show them on the success screen.
  static Future<BulkOrderResult> createBulkOrderDetailed(
    Map<String, dynamic> body,
  ) async {
    if (!loggedIn) {
      return const BulkOrderResult(error: "Please log in to checkout.");
    }
    try {
      final data = await _post("/orders/create-bulk", body);
      final payload = data is Map ? (data["data"] ?? data) : data;
      final numbers = <String>{};
      void collect(dynamic entry) {
        if (entry is! Map) return;
        final n = "${entry["order_number"] ?? entry["orderNumber"] ?? ""}";
        if (n.isNotEmpty) numbers.add(n);
      }

      if (payload is List) {
        for (final entry in payload) {
          collect(entry);
        }
      } else {
        collect(payload);
        final orders = payload is Map ? payload["orders"] : null;
        if (orders is List) {
          for (final entry in orders) {
            collect(entry);
          }
        }
      }
      refreshProfile();
      return BulkOrderResult(orderNumbers: numbers.toList());
    } on ApiError catch (e) {
      return BulkOrderResult(error: e.message);
    } catch (_) {
      return const BulkOrderResult(error: "Could not reach the server.");
    }
  }

  static Future<bool> updateOrderStatus(dynamic orderId, String status) async {
    try {
      await _put("/orders/$orderId/status", {"status": status});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> updateOrderGroupStatus(
    String orderNumber,
    String status,
  ) async {
    try {
      await _put("/orders/group/$orderNumber/status", {"status": status});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> cancelOrderGroup(String orderNumber) async {
    try {
      await _post("/orders/group/$orderNumber/cancel", {});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> submitOrderReport(
    dynamic orderId,
    String reason,
    String customText,
    String side,
  ) async {
    try {
      await _post("/orders/$orderId/report", {
        "reason": reason,
        "custom_text": customText,
        "side": side,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── cart (web cartService) ── */

  static Future<List<Map<String, dynamic>>> getCart() async {
    try {
      final data = await _get("/cart");
      final body = data is Map ? (data["data"] ?? data) : data;
      final items = body is Map ? (body["items"] ?? body["cart"]) : body;
      if (items is List) {
        return items
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      return const [];
    } catch (_) {
      return const [];
    }
  }

  /// POST /cart/items. The backend requires the web `cartService.addItem`
  /// shape (`productId` + `title`, camelCase `variantIndex`) and 400s on
  /// anything else, so callers must pass that exact payload.
  /// Returns the stored row (with its server `id`) or null when it failed.
  static Future<Map<String, dynamic>?> addToCart(
    Map<String, dynamic> item,
  ) async {
    if (!loggedIn) return null;
    try {
      final data = await _post("/cart/items", item);
      return _asMap(data is Map ? (data["data"] ?? data) : data);
    } catch (_) {
      return null;
    }
  }

  static Future<bool> updateCartItem(
    dynamic itemId,
    Map<String, dynamic> updates,
  ) async {
    try {
      await _put("/cart/items/$itemId", updates);
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> removeCartItem(dynamic itemId) async {
    try {
      await _delete("/cart/items/$itemId");
      return true;
    } catch (_) {
      return false;
    }
  }

  /// DELETE /cart — empties the signed-in user's cart.
  static Future<bool> clearCart() async {
    if (!loggedIn) return false;
    try {
      await _delete("/cart");
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── checkout payments (web walletService) ── */

  /// POST /wallet/pay-order — moves the payable total into hold balance and
  /// returns the wallet transfer id that `createBulkOrder` must reference.
  /// Throws [ApiError] so the caller can surface the backend's message
  /// (insufficient balance, blocked country…).
  static Future<String> walletPayOrder(
    double amount, {
    String note = "",
  }) async {
    final data = await _post("/wallet/pay-order", {
      "amount": amount,
      if (note.isNotEmpty) "note": note,
    });
    final id = data is Map ? data["transferId"] : null;
    if (id == null) {
      throw ApiError(500, "Payment did not return a transfer id.");
    }
    return "$id";
  }

  /// POST /wallet/verify-manual-payment-hold — confirms the buyer's manual
  /// (seller-to-seller) transfer is really on hold for this seller/amount.
  /// Returns the verified transfer id.
  static Future<String> verifyManualPaymentHold({
    required String transactionId,
    required String sellerId,
    required double amount,
  }) async {
    final data = await _post("/wallet/verify-manual-payment-hold", {
      "transactionId": transactionId,
      "sellerId": sellerId,
      "amount": amount,
    });
    final id = data is Map ? data["transferId"] : null;
    if (id == null) {
      throw ApiError(404, "Manual payment hold transaction not found.");
    }
    return "$id";
  }

  /* ── reseller share (web ShareModal local link builder) ── */

  static bool isCanonicalShareCode(String value) =>
      RegExp(r'^[0-9A-Za-z]{8}$').hasMatch(value.trim());

  static String buildShareCode(String type, dynamic target, [int length = 8]) {
    const alphabet =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowers = 'abcdefghijklmnopqrstuvwxyz';
    final normalized = "$target".trim();
    if (normalized.isEmpty) return '';
    final payload = '$type:$normalized';
    var stateA = _hash32(payload, 0x9e3779b9);
    var stateB = _hash32(payload, 0x85ebca6b);
    final chars = <String>[];
    for (var i = 0; i < length; i++) {
      stateA =
          ((_imul32(stateA ^ (stateA >> 15), 2246822519) + stateB + i) &
          0xffffffff);
      stateB =
          ((_imul32(stateB ^ (stateB >> 13), 3266489917) + stateA + i * 17) &
          0xffffffff);
      chars.add(alphabet[(stateA ^ stateB) % alphabet.length]);
    }
    if (!chars.any(digits.contains)) {
      chars[(stateA + 1) % length] = digits[stateB % digits.length];
    }
    if (!chars.any(uppers.contains)) {
      chars[(stateB + 3) % length] = uppers[stateA % uppers.length];
    }
    if (!chars.any(lowers.contains)) {
      chars[(stateA + stateB + 5) % length] =
          lowers[(stateA ^ stateB) % lowers.length];
    }
    return chars.join();
  }

  static int _hash32(String input, int seed) {
    var hash = seed & 0xffffffff;
    for (final unit in input.codeUnits) {
      hash ^= unit;
      hash = _imul32(hash, 16777619);
    }
    return hash & 0xffffffff;
  }

  static int _imul32(int a, int b) => (a * b) & 0xffffffff;

  /// Generates a reseller/share link the same way the web ShareModal does:
  /// base share URL + the viewer's username/Googer ID. The backend
  /// `/market/share-unified/:shareCode` route is for lookup, not generation.
  static Future<String?> resellShareLink(
    dynamic shareCodeOrUrl, {
    double commissionPercentage = 0,
  }) async {
    final identifier = (googerId.isNotEmpty ? googerId : username).trim();
    final raw = "$shareCodeOrUrl".trim();
    if (identifier.isEmpty || raw.isEmpty) return null;
    final baseUrl = raw.startsWith("http")
        ? raw.split("?").first.replaceFirst(RegExp(r"/+$"), "")
        : "https://googer.site/share/${Uri.encodeComponent(raw)}";
    return "$baseUrl/${Uri.encodeComponent(identifier)}";
  }
}

class ApiError implements Exception {
  final int status;
  final String message;
  ApiError(this.status, this.message);
}

/// Outcome of `POST /orders/create-bulk`: either an error message or the order
/// numbers the backend grouped the checkout into.
class BulkOrderResult {
  final String? error;
  final List<String> orderNumbers;

  const BulkOrderResult({this.error, this.orderNumbers = const []});

  bool get ok => error == null && orderNumbers.isNotEmpty;
}

int? resolveShareCountResponse(dynamic data, {int? currentCount}) {
  final count = int.tryParse(
    '${data?["shares_count"] ?? data?["shareCount"] ?? data?["shares"] ?? ''}',
  );
  if (count != null) return count;
  if (currentCount != null) {
    return currentCount + (data?["incremented"] == true ? 1 : 0);
  }
  return null;
}
