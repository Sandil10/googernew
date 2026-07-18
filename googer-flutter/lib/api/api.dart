import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import '../data/mock.dart';
import '../util/storage.dart';

/// Real Googer backend client (same Express API the Next.js web app uses).
/// - Web preview: same-origin /api (proxied to :5000 by serve-web.js — no CORS)
/// - Native builds: https://googer.site/api through the Cloudflare tunnel
/// Real data only: failed requests return empty states/errors instead of seeded
/// demo records, so the mobile app reflects the same backend as the web app.
class Api {
  static const String _baseOverride = String.fromEnvironment("GOOGER_API_BASE");
  static String get base {
    if (_baseOverride.isNotEmpty) {
      return _baseOverride.replaceFirst(RegExp(r"/+$"), "");
    }
    return kIsWeb ? "" : "https://googer.site";
  }

  static String? token;
  static Map<String, dynamic>? user;

  static bool get loggedIn => token != null;

  /// Restore the saved session (called once from main() before runApp).
  /// The web app keeps its token across reloads — the Flutter build must too,
  /// otherwise every refresh silently logs the user out.
  static Future<void> init() async {
    token = readStorage("googer_token");
    final saved = readStorage("googer_user");
    if (saved != null && saved.isNotEmpty) {
      try {
        user = _unwrapUser(jsonDecode(saved));
      } catch (_) {}
    }
    if (loggedIn) await refreshProfile();
  }

  static void _persistAuth() {
    writeStorage("googer_token", token);
    writeStorage("googer_user", user == null ? null : jsonEncode(user));
  }
  static String get displayName =>
      (user?["full_name"] ?? user?["username"] ?? "Googer User").toString();
  static String get username => (user?["username"] ?? "googer").toString();
  static String get email => (user?["email"] ?? "").toString();
  static String get googerId =>
      (user?["user_id"] ?? user?["googer_id"] ?? "").toString();
  static double get balance =>
      double.tryParse("${user?["wallet_balance"] ?? ""}") ?? 0;
  static String? get avatar {
    final pic = user?["profile_picture"]?.toString();
    if (pic == null || pic.isEmpty) return null;
    return resolveMedia(pic);
  }

  /// "2h" / "4 D" style relative timestamps (web formatRelativeTime parity).
  static String relativeTime(dynamic iso) {
    final parsed = DateTime.tryParse("$iso");
    if (parsed == null) return "$iso".split("T").first;
    final diff = DateTime.now().difference(parsed.toLocal());
    if (diff.inMinutes < 1) return "now";
    if (diff.inMinutes < 60) return "${diff.inMinutes}m";
    if (diff.inHours < 24) return "${diff.inHours}h";
    if (diff.inDays < 7) return "${diff.inDays}d";
    if (diff.inDays < 30) return "${(diff.inDays / 7).floor()}w";
    if (diff.inDays < 365) return "${(diff.inDays / 30).floor()} mo";
    return "${(diff.inDays / 365).floor()}y";
  }

  /// Resolve backend media paths ("uploads/x.jpg", "/uploads/x.jpg", full URLs, data URIs)
  static String resolveMedia(String src) {
    if (src.startsWith("http") || src.startsWith("data:")) return src;
    final normalized = src.replaceAll("\\", "/");
    // keep subfolders like /uploads/upload-content/... intact
    if (normalized.startsWith("/uploads/")) return "$base$normalized";
    if (normalized.startsWith("uploads/")) return "$base/$normalized";
    final file = normalized.split("/").last;
    return "$base/uploads/$file";
  }

  static Map<String, String> _headers() => {
        "Content-Type": "application/json",
        if (token != null) "Authorization": "Bearer $token",
      };

  static Future<dynamic> _get(String path) async {
    final res = await http
        .get(Uri.parse("$base/api$path"), headers: _headers())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final res = await http
        .post(Uri.parse("$base/api$path"),
            headers: _headers(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _put(String path, Map<String, dynamic> body) async {
    final res = await http
        .put(Uri.parse("$base/api$path"),
            headers: _headers(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 15));
    if (res.statusCode >= 400) throw ApiError(res.statusCode, _msg(res));
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static Future<dynamic> _patch(String path, Map<String, dynamic> body) async {
    final res = await http
        .patch(Uri.parse("$base/api$path"),
            headers: _headers(), body: jsonEncode(body))
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

  static Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    return null;
  }

  static Map<String, dynamic>? _unwrapUser(dynamic data) {
    final m = _asMap(data);
    if (m == null) return null;
    for (final key in ["user", "data", "profile"]) {
      final nested = _asMap(m[key]);
      if (nested != null) return nested;
    }
    return m.containsKey("success") && m.length <= 2 ? null : m;
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
      final data =
          await _post("/auth/login", {"email": emailIn, "password": password});
      if (data is Map && data["otpRequired"] == true) {
        final message =
            (data["message"] ?? "OTP sent to registered email").toString();
        final debugOtp = data["debugOtp"]?.toString();
        return "OTP_REQUIRED|$message${debugOtp == null || debugOtp.isEmpty ? "" : " (OTP: $debugOtp)"}";
      }
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
      String emailIn, String password, String otp) async {
    try {
      final data = await _post("/auth/login/verify-otp", {
        "email": emailIn,
        "password": password,
        "otp": otp,
      });
      if (data is Map && data["approvalRequired"] == true) {
        return (data["message"] ??
                "A trusted device must approve this login request.")
            .toString();
      }
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
      String emailIn) async {
    try {
      final data = await _post("/auth/forgot-password/request-otp", {
        "email": emailIn,
      });
      return (error: null, debugOtp: data?["debugOtp"]?.toString());
    } on ApiError catch (e) {
      return (error: e.message, debugOtp: null);
    } catch (_) {
      return (error: "Could not reach the server. Please try again.", debugOtp: null);
    }
  }

  static Future<({String? error, String? resetToken})> verifyPasswordResetOtp(
      String emailIn, String otp) async {
    try {
      final data = await _post("/auth/forgot-password/verify-otp", {
        "email": emailIn,
        "otp": otp,
      });
      return (
        error: null,
        resetToken: (data?["resetToken"] ?? data?["reset_token"])?.toString()
      );
    } on ApiError catch (e) {
      return (error: e.message, resetToken: null);
    } catch (_) {
      return (error: "Could not reach the server. Please try again.", resetToken: null);
    }
  }

  static Future<String?> resetPasswordWithOtp(
      String emailIn, String resetToken, String newPassword) async {
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
      final profile = _unwrapUser(await _get("/auth/profile"));
      if (profile != null) {
        user = profile;
        _persistAuth();
      }
    } on ApiError catch (e) {
      // stored token no longer valid → drop the stale session
      if (e.status == 401 || e.status == 403) logout();
    } catch (_) {}
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
              (raw) => parseGoog(Map<String, dynamic>.from(raw as Map)))
          .toList();
    } catch (_) {
      return const [];
    }
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
      text: (m["text"] ?? m["content"] ?? "").toString(),
      textColor:
          parseColor(m["textColor"]?.toString() ?? m["text_color"]?.toString()),
      time: relativeTime(m["createdAt"] ?? m["created_at"] ?? ""),
      username: (u["username"] ?? m["username"] ?? "googer").toString(),
      name: (u["full_name"] ?? u["name"] ?? m["full_name"] ?? "Googer User")
          .toString(),
      img: resolveMedia(
          (u["profile_picture"] ?? u["img"] ?? "").toString().isEmpty
              ? ""
              : (u["profile_picture"] ?? u["img"]).toString()),
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

  static Future<List<HomeAd>> activeAds({String shuffleSeed = ""}) async {
    try {
      final ads = <HomeAd>[];
      int offset = 0;
      for (int page = 0; page < 4; page++) {
        final data = await _get(
            "/ads/active-public?limit=50&offset=$offset&shuffle=${Uri.encodeComponent(shuffleSeed)}");
        final list = data?["ads"];
        if (list is! List || list.isEmpty) break;
        for (final raw in list) {
          if (raw is! Map) continue;
          final m = Map<String, dynamic>.from(raw);
          final status = (m["status"] ?? m["delivery_status"] ?? "Active")
              .toString()
              .toLowerCase();
          if (status != "active") continue;
          ads.add(_parseHomeAd(m));
        }
        final pagination = data?["pagination"];
        final hasMore = pagination is Map && pagination["hasMore"] == true;
        if (!hasMore) break;
        offset = int.tryParse("${pagination["nextOffset"]}") ??
            (offset + list.length);
      }
      return ads;
    } catch (_) {
      return const [];
    }
  }

  static HomeAd _parseHomeAd(Map<String, dynamic> m) {
    final draft = m["editDraft"] is Map
        ? Map<String, dynamic>.from(m["editDraft"])
        : m["edit_draft"] is Map
            ? Map<String, dynamic>.from(m["edit_draft"])
            : <String, dynamic>{};
    final adId = (m["adId"] ?? m["ad_id"] ?? "${m["id"]}")
        .toString()
        .replaceFirst(RegExp(r"^ad-"), "");
    final campaignType =
        (m["campaign_type"] ?? m["campaignType"] ?? "Ads").toString();
    final isProduct = campaignType.trim().toLowerCase() == "product promote";
    final gallery = m["media_gallery"] is List
        ? m["media_gallery"] as List
        : m["mediaGallery"] is List
            ? m["mediaGallery"] as List
            : const [];
    String media =
        (m["media_preview"] ?? m["mediaPreview"] ?? m["image_url"] ?? "")
            .toString();
    if (media.isEmpty && gallery.isNotEmpty) media = gallery.first.toString();
    return HomeAd(
      adId: adId,
      campaignType: campaignType,
      title: (m["title"] ?? m["topic"] ?? draft["topic"] ?? campaignType)
          .toString(),
      description: (m["description"] ?? "").toString(),
      mediaPreview: media.isEmpty ? "" : resolveMedia(media),
      mediaType: (m["media_type"] ?? m["mediaType"] ?? "").toString(),
      username: (m["owner_username"] ??
              m["ownerUsername"] ??
              m["username"] ??
              (m["user"] is Map ? m["user"]["username"] : null) ??
              "Ads")
          .toString(),
      fullName: (m["full_name"] ??
              (m["user"] is Map ? m["user"]["full_name"] : null) ??
              "")
          .toString(),
      avatar: resolveMedia((m["profile_picture"] ??
              m["owner_profile_picture"] ??
              (m["user"] is Map ? m["user"]["profile_picture"] : null) ??
              "")
          .toString()),
      ctaTopic:
          (draft["ctaTopic"] ?? m["cta_topic"] ?? "Visit").toString(),
      ctaValue: (draft["ctaValue"] ?? m["cta_value"] ?? "").toString(),
      activeLink: (draft["activeLink"] ??
              m["active_link"] ??
              m["activeLink"] ??
              draft["ctaValue"] ??
              m["cta_value"] ??
              "")
          .toString(),
      price: isProduct
          ? (double.tryParse(
                  "${m["price"] ?? m["main_price"] ?? m["product_price"] ?? 0}") ??
              0)
          : (double.tryParse("${m["budget"] ?? 0}") ?? 0),
      promoPrice: double.tryParse("${m["promo_price"] ?? ""}"),
      discount: _parseAdDiscount(m["commission_info"]),
      linkedProductId: int.tryParse(
              "${m["linked_product_id"] ?? m["product_id"] ?? m["productId"] ?? 0}") ??
          0,
      featuredItems: _parseFeaturedItems(draft),
      linkedProductShareCode: (m["linked_product_share_code"] ??
              m["linked_product_code"] ??
              m["share_code"] ??
              "")
          .toString(),
      ownerUserId:
          (m["user_id"] ?? m["userId"] ?? m["advertiser_id"] ?? "").toString(),
      likes: int.tryParse("${m["likes_count"] ?? 0}") ?? 0,
      comments: int.tryParse("${m["comments_count"] ?? 0}") ?? 0,
      views: int.tryParse("${m["views_count"] ?? m["viewCount"] ?? 0}") ?? 0,
      shares: int.tryParse("${m["shares_count"] ?? 0}") ?? 0,
      liked: m["user_liked"] == true,
      likeLocked: m["ad_like_locked"] == true,
      coinCollected: m["ad_coin_collected"] == true,
    );
  }

  /// commission_info may be a JSON string or map — pull the seller discount %.
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

  /// Profile Promote editDraft.featuredItems — the 3-item product/content grid.
  static List<Map<String, dynamic>> _parseFeaturedItems(Map<String, dynamic> draft) {
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
  static Future<double?> collectAdCoin(String adId, {String adType = "Ads"}) async {
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

  /// GET /market?user_id=X — a promoted profile's active market items
  /// (used by the Profile Promote card grid, same as the web card).
  static Future<List<Map<String, dynamic>>> userMarketItems(String userId) async {
    if (userId.trim().isEmpty) return const [];
    try {
      final data = await _get(
          "/market?user_id=${Uri.encodeComponent(userId)}&status=active,approved");
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

  static Future<void> markAdView(String interactionId) async {
    try {
      await _post("/market/$interactionId/view", {});
    } catch (_) {}
  }

  static Future<void> markAdImpression(String interactionId) async {
    try {
      await _post("/market/$interactionId/impression", {});
    } catch (_) {}
  }

  static Future<void> shareAd(String interactionId) async {
    try {
      await _post("/market/$interactionId/share", {});
    } catch (_) {}
  }

  /// GET /market/{ad-N}/likes|shares|views|comments (kind plural)
  static Future<List<Map<String, dynamic>>> adInteractions(
      String interactionId, String kind) async {
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

  static Future<bool> addAdComment(String interactionId, String text) async {
    if (!loggedIn) return false;
    try {
      await _post("/market/$interactionId/comments", {"comment": text, "text": text});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> reportAd(String adId, String reason) async {
    if (!loggedIn) return false;
    try {
      await _post("/ads/$adId/report", {"reason": reason});
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── shop (market) ── */

  static Future<List<Product>> shopProducts() async {
    try {
      final data = await _get("/market/products?limit=40");
      final list = _unwrapList(data, ["products", "data", "items"]);
      return list.map<Product>((raw) {
        final m = Map<String, dynamic>.from(raw as Map);
        // image priority matches the market API: main_image > image_url > thumbnail > media_url > images[0]
        String img = "";
        for (final key in [
          "main_image",
          "image_url",
          "thumbnail_url",
          "media_url"
        ]) {
          final v = m[key];
          if (v != null && v.toString().isNotEmpty) {
            img = v.toString();
            break;
          }
        }
        if (img.isEmpty) {
          final media = m["images"] ?? m["media_gallery"] ?? m["media"];
          if (media is List && media.isNotEmpty) {
            final first = media.first;
            img = first is Map
                ? (first["url"] ?? first["src"] ?? "").toString()
                : first.toString();
          }
        }
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
          seller: (m["owner_username"] ??
                  m["shop_name"] ??
                  m["username"] ??
                  "Googer Seller")
              .toString(),
          rating: double.tryParse("${m["rating"] ?? 4.5}") ?? 4.5,
          sold: int.tryParse("${m["sold"] ?? m["sales_count"] ?? 0}") ?? 0,
          category:
              (m["category"] ?? m["manual_category"] ?? "General").toString(),
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

  static Future<List<Conversation>> chats() async {
    try {
      final data = await _get("/chat/conversations");
      final list = _unwrapList(data, ["conversations", "data", "items"]);
      return list.map<Conversation>((raw) {
        final m = Map<String, dynamic>.from(raw as Map);
        // peer info may be flat or nested under peer/user/other_user/participant
        Map<String, dynamic> peer = m;
        for (final key in [
          "peer",
          "user",
          "other_user",
          "participant",
          "partner"
        ]) {
          if (m[key] is Map) {
            peer = Map<String, dynamic>.from(m[key]);
            break;
          }
        }
        final pic =
            (peer["profile_picture"] ?? peer["img"] ?? peer["avatar"] ?? "")
                .toString();
        return Conversation(
          (peer["username"] ?? m["peer_username"] ?? m["username"] ?? "user")
              .toString(),
          (peer["full_name"] ??
                  peer["name"] ??
                  m["peer_name"] ??
                  m["full_name"] ??
                  "Googer User")
              .toString(),
          pic.isEmpty ? "" : resolveMedia(pic),
          (m["last_message"] ??
                  m["lastMessage"] ??
                  m["last"] ??
                  m["preview"] ??
                  "")
              .toString(),
          (m["updated_at"] ?? m["updatedAt"] ?? m["last_message_at"] ?? "")
              .toString()
              .split("T")
              .first,
          int.tryParse(
                  "${m["unread"] ?? m["unread_count"] ?? m["unreadCount"] ?? 0}") ??
              0,
          m["online"] == true || peer["online"] == true,
          int.tryParse(
                  "${peer["id"] ?? m["participant_id"] ?? m["peer_id"] ?? m["user_id"] ?? 0}") ??
              0,
        );
      }).toList();
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

  static Future<void> markGoogView(int id) async {
    try {
      await _post("/googs/$id/view", {});
    } catch (_) {}
  }

  static Future<void> shareGoog(int id) async {
    try {
      await _post("/googs/$id/share", {});
    } catch (_) {}
  }

  static Future<bool> reportGoog(int id, String reason, String details) async {
    try {
      await _post("/googs/$id/report", {"reason": reason, "details": details});
      return true;
    } catch (_) {
      return false;
    }
  }

  /// type: likes | comments | shares | views — returns raw entries
  static Future<List<Map<String, dynamic>>> googInteractions(
      int id, String type) async {
    try {
      final data = await _get("/googs/$id/$type");
      final list = _unwrapList(data, [type, "data", "entries", "users"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<bool> postGoogComment(int id, String text) async {
    try {
      await _post("/googs/$id/comments", {"text": text});
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── upload content (vault / flash) — same as web uploadContentService ── */

  static Future<List<UploadContent>> uploadContents() async {
    try {
      final data = await _get("/upload-content/public");
      final list = _unwrapList(data, ["contents", "data", "items"]);
      return list.map<UploadContent>((raw) {
        final m = Map<String, dynamic>.from(raw as Map);
        final thumb =
            (m["thumbnail_url"] ?? m["media_preview"] ?? m["preview_url"] ?? "")
                .toString();
        final rawHashtags = m["hashtags"];
        final hashtags = rawHashtags is List
            ? rawHashtags.map((e) => e.toString()).join(" ")
            : (rawHashtags ?? "").toString();
        // Playable media: prefer an uploaded video file from media_gallery,
        // then media_url, then the preview image (web watch-modal parity).
        final gallery = m["media_gallery"] is List
            ? (m["media_gallery"] as List).map((e) => e.toString()).toList()
            : const <String>[];
        final videoExt =
            RegExp(r"\.(mp4|webm|mov|m4v|ogg)(\?.*)?$", caseSensitive: false);
        final galleryVideo = gallery.firstWhere(
            (entry) => videoExt.hasMatch(entry),
            orElse: () => "");
        final playable = [
          (m["media_url"] ?? "").toString(),
          galleryVideo,
          gallery.isNotEmpty ? gallery.first : "",
          (m["preview_url"] ?? "").toString(),
          (m["media_preview"] ?? "").toString(),
        ].firstWhere((v) => v.trim().isNotEmpty, orElse: () => "");
        return UploadContent(
          id: int.tryParse("${m["id"]}") ?? 0,
          contentId: (m["content_id"] ?? m["contentId"] ?? "").toString(),
          type: (m["content_type"] ?? "vault").toString(),
          topic: (m["topic"] ?? "General").toString(),
          description: (m["description"] ?? "").toString(),
          hashtags: hashtags,
          thumbnail: thumb.isEmpty ? "" : resolveMedia(thumb),
          mediaUrl: playable.isEmpty ? "" : resolveMedia(playable),
          mediaType: (m["media_type"] ?? "").toString(),
          externalLink: (m["external_link"] ?? "").toString(),
          coins: double.tryParse("${m["price"] ?? 0}") ?? 0,
          username:
              (m["username"] ?? m["owner_username"] ?? "googer").toString(),
          fullName: (m["full_name"] ?? m["username"] ?? "Googer").toString(),
          avatar: (m["profile_picture"] ?? "").toString().isEmpty
              ? ""
              : resolveMedia(m["profile_picture"].toString()),
          time: relativeTime(m["created_at"] ?? ""),
          likes: int.tryParse("${m["likes_count"] ?? 0}") ?? 0,
          comments: int.tryParse("${m["comments_count"] ?? 0}") ?? 0,
          views: int.tryParse("${m["views_count"] ?? 0}") ?? 0,
          shares: int.tryParse("${m["shares_count"] ?? 0}") ?? 0,
          reposts: int.tryParse("${m["reposts_count"] ?? 0}") ?? 0,
          liked: m["user_liked"] == true,
          hasAccess:
              m["user_has_access"] == true || m["user_purchased"] == true,
          userReposted: m["user_reposted"] == true,
          resellerRef: (m["reseller_ref"] ?? m["resell_ref"])?.toString(),
        );
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<void> likeUploadContent(int id) async {
    try {
      await _post("/upload-content/$id/like", {});
    } catch (_) {}
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
        alreadyReposted: false
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

  static Future<void> markUploadView(int id) async {
    try {
      await _post("/upload-content/$id/view", {});
    } catch (_) {}
  }

  static Future<String?> purchaseUploadContent(int id,
      {String? resellerRef}) async {
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

  /* ── chat (same endpoints as web chatService) ── */

  static Future<List<Map<String, dynamic>>> chatMessages(
      int participantId) async {
    try {
      final data = await _get("/chat/messages/$participantId?markSeen=1");
      final list = _unwrapList(data, ["messages", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<bool> sendChatMessage(int receiverId, String text) async {
    try {
      await _post("/chat/messages",
          {"receiverId": receiverId, "type": "text", "text": text});
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── market engagement ── */

  static Future<void> toggleProductLike(int id) async {
    try {
      await _post("/market/$id/like", {});
    } catch (_) {}
  }

  /* ── wallet transfer (same as web walletService.directTransfer) ── */

  static Future<List<Map<String, dynamic>>> searchWalletUsers(
      String query) async {
    try {
      final data = await _get(
          "/wallet/search-users?query=${Uri.encodeComponent(query)}");
      final list = _unwrapList(data, ["users", "data", "items"]);
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<String?> walletTransfer(
      int receiverId, double amount, String note) async {
    try {
      await _post("/wallet/transfer", {
        "receiverId": receiverId,
        "amount": amount,
        "note": note,
        "commissionPercentage": 0
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
      int id, String text, String textColorHex) async {
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
              (raw) => parseGoog(Map<String, dynamic>.from(raw as Map)))
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
      final data =
          await _get("/auth/username/${Uri.encodeComponent(username)}");
      return _unwrapUser(data);
    } catch (_) {
      return null;
    }
  }

  static Future<List<Map<String, dynamic>>> _userList(String path) async {
    try {
      final data = await _get(path);
      final list =
          _unwrapList(data, ["users", "followers", "following", "data", "views"]);
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
      return r is Map && (r["subscribed"] == true || r["isSubscribed"] == true);
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

  /// Verified-badge tier by plan — GET /subscriptions/badge/{userId}
  static Future<String?> badgeForUser(dynamic userId) async {
    try {
      final r = await _get("/subscriptions/badge/$userId");
      return (r is Map ? (r["badge"] ?? r["tier"]) : null)?.toString();
    } catch (_) {
      return null;
    }
  }

  /* ── wallet requests (web walletService.requestMoney / respond / cancel) ── */

  static Future<String?> requestMoney(
      int receiverId, double amount, String note) async {
    try {
      await _post("/wallet/request", {
        "receiverId": receiverId,
        "amount": amount,
        "note": note,
        "commissionPercentage": 0,
        "type": "request",
      });
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return "Could not reach the server.";
    }
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
      await _post(
          "/wallet/respond", {"requestId": requestId, "action": action});
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

  static Future<String?> subscribePlan(int planId,
      {bool switchPlan = false}) async {
    try {
      await _post("/subscriptions/subscribe",
          {"plan_id": planId, "switch_plan": switchPlan});
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

  static Future<bool> addProductComment(int id, String text) async {
    try {
      await _post("/market/$id/comments", {"text": text});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> markProductView(int id) async {
    try {
      await _post("/market/$id/view", {});
    } catch (_) {}
  }

  static Future<void> shareProduct(int id) async {
    try {
      await _post("/market/$id/share", {});
    } catch (_) {}
  }

  static Future<bool> reportProduct(
      int id, String reason, String details) async {
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
      await _post(
          "/chat/presence", {"activeParticipantId": activeParticipantId});
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
      String currentPassword, String newPassword) async {
    try {
      await _post("/auth/change-password",
          {"currentPassword": currentPassword, "newPassword": newPassword});
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
          "/auth/check-username?username=${Uri.encodeComponent(username)}");
      return r is Map ? r["available"] == true : null;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> updateProfile(Map<String, dynamic> fields) async {
    try {
      await _put("/auth/update-profile", fields);
      await refreshProfile();
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
}

class ApiError implements Exception {
  final int status;
  final String message;
  ApiError(this.status, this.message);
}
