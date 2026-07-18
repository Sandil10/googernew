// Seed data so every screen renders fully without a backend — mirrors the web app records.

class GoogPost {
  final int id;
  final String text;
  final int? textColor; // ARGB
  final String time;
  final String username, name, img;
  final int? badgeColor;
  final int likes, comments, views, shares;
  final bool liked;
  final bool saved;
  final String shareCode;
  const GoogPost({
    required this.id,
    required this.text,
    this.textColor,
    required this.time,
    required this.username,
    required this.name,
    required this.img,
    this.badgeColor,
    required this.likes,
    required this.comments,
    required this.views,
    required this.shares,
    this.liked = false,
    this.saved = false,
    this.shareCode = "",
  });
}

const feedPosts = [
  GoogPost(id: 1, text: "Just listed a fresh drop in my shop — check it out! #googer #shop", time: "8m", username: "nimasha", name: "Nimasha Perera", img: "https://i.pravatar.cc/80?img=47", badgeColor: 0xFF3B82F6, likes: 128, comments: 14, views: 2210, shares: 9),
  GoogPost(id: 2, text: "Earned my first 500 Rupier coins today 🎉 The ad center actually works!", textColor: 0xFF4ADE80, time: "42m", username: "kasun_lk", name: "Kasun Silva", img: "https://i.pravatar.cc/80?img=15", likes: 342, comments: 51, views: 5804, shares: 22, liked: true),
  GoogPost(id: 3, text: "New reel is live — behind the scenes of the studio build. www.youtube.com/watch?v=xyz", time: "1h", username: "tharindu", name: "Tharindu J", img: "https://i.pravatar.cc/80?img=33", badgeColor: 0xFFF59E0B, likes: 88, comments: 6, views: 940, shares: 3),
  GoogPost(id: 4, text: "Anyone selling a good camera setup? DM me @nimasha #marketplace", time: "3h", username: "dev_amaya", name: "Amaya Fernando", img: "https://i.pravatar.cc/80?img=5", likes: 41, comments: 19, views: 620, shares: 1),
  GoogPost(id: 5, text: "Flash content ads are the best ROI on Googer right now. Try one for a day.", textColor: 0xFF38BDF8, time: "5h", username: "googer_tips", name: "Googer Tips", img: "https://i.pravatar.cc/80?img=68", badgeColor: 0xFF3B82F6, likes: 517, comments: 73, views: 12100, shares: 64),
];

class Product {
  final int id;
  final String title, image, seller, category, description;
  final double price;
  final double? oldPrice;
  final double rating;
  final int sold;
  // engagement (same as web product boxes: heart / views / comments / share)
  final int likes, views, comments, shares;
  final bool liked;
  const Product({
    required this.id,
    required this.title,
    required this.price,
    this.oldPrice,
    required this.image,
    required this.seller,
    required this.rating,
    required this.sold,
    required this.category,
    required this.description,
    this.likes = 0,
    this.views = 0,
    this.comments = 0,
    this.shares = 0,
    this.liked = false,
  });
}

const products = [
  Product(id: 1, title: "Wireless Noise-Cancelling Headphones", price: 12500, oldPrice: 15900, image: "https://picsum.photos/seed/head/400/400", seller: "TechZone LK", rating: 4.8, sold: 214, category: "Electronics", description: "Premium over-ear headphones with 40h battery, ANC and fast charge."),
  Product(id: 2, title: "Minimal Leather Watch — Black", price: 8900, image: "https://picsum.photos/seed/watch/400/400", seller: "Urban Gear", rating: 4.6, sold: 98, category: "Fashion", description: "Genuine leather strap, sapphire glass, 5ATM water resistance."),
  Product(id: 3, title: "Espresso Coffee Maker 15-Bar", price: 24900, oldPrice: 29900, image: "https://picsum.photos/seed/coffee/400/400", seller: "HomePro", rating: 4.9, sold: 156, category: "Home", description: "Barista-grade espresso at home with milk frother and dual shot."),
  Product(id: 4, title: "Running Shoes AeroLite v3", price: 10400, image: "https://picsum.photos/seed/shoes/400/400", seller: "SportHub", rating: 4.5, sold: 371, category: "Sports", description: "Featherweight mesh upper with responsive foam midsole."),
  Product(id: 5, title: "Mechanical Keyboard RGB 75%", price: 15800, image: "https://picsum.photos/seed/keyb/400/400", seller: "TechZone LK", rating: 4.7, sold: 122, category: "Electronics", description: "Hot-swappable switches, gasket mount, tri-mode connectivity."),
  Product(id: 6, title: "Ceramic Plant Pot Set (3pc)", price: 3200, image: "https://picsum.photos/seed/plant/400/400", seller: "GreenNest", rating: 4.4, sold: 68, category: "Home", description: "Matte-finish ceramic pots with bamboo trays, 3 sizes."),
];

class Category {
  final String name;
  final int icon; // material codePoint
  const Category(this.name, this.icon);
}

const categories = [
  Category("Electronics", 0xe30a), // memory
  Category("Fashion", 0xe15c), // checkroom
  Category("Home", 0xe318), // home
  Category("Sports", 0xea26), // sports_basketball
  Category("Beauty", 0xe3ae), // auto_awesome
  Category("Toys", 0xea28), // sports_esports
  Category("Books", 0xe865), // menu_book
  Category("Vehicles", 0xe531), // directions_car
];

class Conversation {
  final String username, name, img, last, time;
  final int unread;
  final bool online;
  final int peerId; // backend participant id (0 = demo)
  const Conversation(this.username, this.name, this.img, this.last, this.time, this.unread, this.online,
      [this.peerId = 0]);
}

const conversations = [
  Conversation("nimasha", "Nimasha Perera", "https://i.pravatar.cc/80?img=47", "The order shipped this morning 📦", "2m", 2, true),
  Conversation("kasun_lk", "Kasun Silva", "https://i.pravatar.cc/80?img=15", "Can you send the payment proof?", "18m", 0, true),
  Conversation("tharindu", "Tharindu J", "https://i.pravatar.cc/80?img=33", "🔥🔥🔥", "1h", 0, false),
  Conversation("dev_amaya", "Amaya Fernando", "https://i.pravatar.cc/80?img=5", "Deal. R 9,500 final.", "3h", 1, false),
  Conversation("googer_support", "Googer Support", "https://i.pravatar.cc/80?img=68", "Your ticket #4821 has been resolved.", "1d", 0, true),
];

class ChatMessage {
  final int id;
  final String text, time;
  final bool mine;
  const ChatMessage(this.id, this.text, this.mine, this.time);
}

const chatSeed = [
  ChatMessage(1, "Hey! Is the headphone still available?", true, "10:02"),
  ChatMessage(2, "Yes! Brand new, sealed box.", false, "10:03"),
  ChatMessage(3, "Can you do R 11,500?", true, "10:05"),
  ChatMessage(4, "R 12,000 and I'll cover delivery 🚚", false, "10:06"),
  ChatMessage(5, "Deal. Sending via Googer Pay now.", true, "10:08"),
  ChatMessage(6, "The order shipped this morning 📦", false, "10:41"),
];

class Tx {
  final int id;
  final String type; // sent | received | topup | withdrawal
  final String counterparty, date, status;
  final double amount;
  const Tx(this.id, this.type, this.counterparty, this.amount, this.date, this.status);
}

const transactions = [
  Tx(1, "received", "@nimasha", 1200, "2026-07-09", "completed"),
  Tx(2, "sent", "@kasun_lk", 450.5, "2026-07-08", "completed"),
  Tx(3, "topup", "Bank Transfer", 5000, "2026-07-06", "completed"),
  Tx(4, "withdrawal", "Commercial Bank ••4821", 2500, "2026-07-03", "pending"),
  Tx(5, "received", "@dev_amaya", 9500, "2026-07-01", "completed"),
  Tx(6, "sent", "@tharindu", 300, "2026-06-28", "failed"),
];

class MyAd {
  final int id;
  final String type, title, status, expires;
  final int views, coins;
  const MyAd(this.id, this.type, this.title, this.status, this.views, this.coins, this.expires);
}

const myAds = [
  MyAd(1, "Photo & Video", "Summer Drop Teaser", "Active", 4210, 320, "3 days"),
  MyAd(2, "Product Promote", "Headphones — Flash Sale", "Active", 1876, 140, "12 hours"),
  MyAd(3, "Profile Promote", "Grow @sandil", "Ended", 9034, 610, "—"),
];

class Plan {
  final String name;
  final int price;
  final List<String> features;
  final bool popular;
  const Plan(this.name, this.price, this.features, {this.popular = false});
}

const subscriptionPlans = [
  Plan("Free", 0, ["5 Googs / month", "2 product listings", "75 letter limit", "Basic support"]),
  Plan("Silver", 490, ["50 Googs / month", "15 product listings", "150 letter limit", "10 Goog colors", "Priority support"]),
  Plan("Gold", 990, ["Unlimited Googs", "60 product listings", "300 letter limit", "20 Goog colors", "Verified-fast review", "Reseller tools"], popular: true),
  Plan("Platinum", 1990, ["Everything in Gold", "Unlimited products", "No letter limit", "All Goog colors", "Dedicated manager", "0% withdrawal fee"]),
];

class Notif {
  final int id, icon, color;
  final String title, time;
  const Notif(this.id, this.icon, this.color, this.title, this.time);
}

const notifs = [
  Notif(1, 0xe25b, 0xFFEF4444, "Nimasha liked your Goog", "5m"), // favorite
  Notif(2, 0xe2eb, 0xFF4ADE80, "You received R 1,200 from @nimasha", "1h"), // payments
  Notif(3, 0xe0af, 0xFF38BDF8, "Your ad 'Summer Drop Teaser' reached 4,000 views", "3h"), // campaign
  Notif(4, 0xe32a, 0xFF60A5FA, "New login from Chrome on Windows", "1d"), // security
  Notif(5, 0xe0b7, 0xFFFBBF24, "Kasun commented: \"Congrats! 🎉\"", "2d"), // chat
];

class Device {
  final int id;
  final String name, location, lastActive;
  final bool current;
  final int icon;
  const Device(this.id, this.name, this.location, this.lastActive, this.current, this.icon);
}

const trustedDevices = [
  Device(1, "Samsung Galaxy S24", "Colombo, LK", "Now — this device", true, 0xe32c),
  Device(2, "Chrome on Windows", "Colombo, LK", "2 hours ago", false, 0xe30b),
  Device(3, "Safari on iPhone", "Kandy, LK", "3 days ago", false, 0xe32c),
];

class SecAlert {
  final int id;
  final String severity, title, detail, time;
  const SecAlert(this.id, this.severity, this.title, this.detail, this.time);
}

const securityAlerts = [
  SecAlert(1, "high", "New device signed in", "Safari on iPhone — Kandy, LK", "3 days ago"),
  SecAlert(2, "medium", "Password changed", "Your login password was updated", "2 weeks ago"),
  SecAlert(3, "low", "New passkey added", "Windows Hello passkey registered", "1 month ago"),
];

class CoinPack {
  final int coins, bonus;
  final double price;
  const CoinPack(this.coins, this.price, this.bonus);
}

const coinPacks = [
  CoinPack(100, 110, 0),
  CoinPack(500, 520, 25),
  CoinPack(1000, 990, 80),
  CoinPack(5000, 4750, 550),
];

/// Vault / flash upload content (feed cards with WATCH NOW + coins)
class UploadContent {
  final int id;
  final String contentId, type, topic, description, hashtags, thumbnail, mediaUrl;
  final String mediaType; // "image" | "video" (backend media_type)
  final String externalLink; // YouTube/Instagram/TikTok source when set
  final double coins;
  final String username, fullName, avatar, time;
  final int likes, comments, views, shares, reposts;
  final bool liked, hasAccess, userReposted;
  final String? resellerRef;
  const UploadContent({
    required this.id,
    this.contentId = "",
    required this.type,
    required this.topic,
    required this.description,
    required this.hashtags,
    required this.thumbnail,
    required this.mediaUrl,
    this.mediaType = "",
    this.externalLink = "",
    required this.coins,
    required this.username,
    required this.fullName,
    required this.avatar,
    required this.time,
    required this.likes,
    required this.comments,
    required this.views,
    required this.shares,
    required this.reposts,
    this.liked = false,
    this.hasAccess = false,
    this.userReposted = false,
    this.resellerRef,
  });
}

const demoUploadContents = [
  UploadContent(
    id: 1, type: "vault", topic: "Comedy", description: "new", hashtags: "#k",
    thumbnail: "https://picsum.photos/seed/vault1/600/600", mediaUrl: "",
    coins: 10, username: "g1", fullName: "g1", avatar: "https://i.pravatar.cc/80?img=21",
    time: "1 D", likes: 1, comments: 0, views: 1, shares: 1, reposts: 0,
  ),
  UploadContent(
    id: 2, type: "flash", topic: "Food & Cooking", description: "Street food tour 🍜", hashtags: "#food #colombo",
    thumbnail: "https://picsum.photos/seed/vault2/600/600", mediaUrl: "",
    coins: 0, username: "nimasha", fullName: "Nimasha Perera", avatar: "https://i.pravatar.cc/80?img=47",
    time: "3 D", likes: 24, comments: 6, views: 210, shares: 4, reposts: 2, hasAccess: true,
  ),
];

/// Sponsored ad in the home feed — mirrors the web `mapPublicActiveAdToHomeAd`
/// shape from app/dashboard/page.tsx (GET /api/ads/active-public).
class HomeAd {
  final String adId; // numeric ad id, without the "ad-" prefix
  final String campaignType; // "Photo and Video" | "Product Promote" | "Profile Promote" | ...
  final String title, description;
  final String mediaPreview, mediaType;
  final String username, fullName, avatar;
  final String ctaTopic, ctaValue, activeLink;
  final double price;
  final double? promoPrice; // promo/sale price of the linked product (if any)
  final String discount; // commission_info.discount, e.g. "10" → "+10%" badge
  final int linkedProductId; // market.id of the linked product (Product Promote)
  final String linkedProductShareCode;
  final String ownerUserId;
  final List<Map<String, dynamic>> featuredItems; // Profile Promote grid items
  final int likes, comments, views, shares;
  final bool liked, likeLocked, coinCollected;

  const HomeAd({
    required this.adId,
    required this.campaignType,
    required this.title,
    required this.description,
    this.mediaPreview = "",
    this.mediaType = "",
    required this.username,
    this.fullName = "",
    this.avatar = "",
    this.ctaTopic = "Visit",
    this.ctaValue = "",
    this.activeLink = "",
    this.price = 0,
    this.promoPrice,
    this.discount = "",
    this.linkedProductId = 0,
    this.linkedProductShareCode = "",
    this.ownerUserId = "",
    this.featuredItems = const [],
    this.likes = 0,
    this.comments = 0,
    this.views = 0,
    this.shares = 0,
    this.liked = false,
    this.likeLocked = false,
    this.coinCollected = false,
  });

  /// Interaction id used by the /market engagement endpoints ("ad-12").
  String get interactionId => "ad-$adId";

  bool get isProfilePromote {
    final t = campaignType.trim().toLowerCase().replaceAll(RegExp(r"[_-]+"), " ");
    return t == "profile promote" || t == "profile promote ad" || mediaType.toLowerCase() == "profile";
  }

  bool get isProductPromote =>
      campaignType.trim().toLowerCase() == "product promote";

  /// Same as the web SharedProductCard: promo price wins when set.
  double get displayPrice =>
      (promoPrice != null && promoPrice! > 0) ? promoPrice! : price;

  double? get oldPrice =>
      (promoPrice != null && promoPrice! > 0 && promoPrice! < price)
          ? price
          : null;
}

const demoHomeAds = [
  HomeAd(
    adId: "9001", campaignType: "Photo and Video",
    title: "Grow with Googer Ads", description: "Reach thousands of daily viewers with a one-day flash campaign.",
    mediaPreview: "https://picsum.photos/seed/ad1/800/500",
    username: "googer_ads", fullName: "Googer Ads", avatar: "https://i.pravatar.cc/80?img=68",
    ctaTopic: "Visit", ctaValue: "googer.site", activeLink: "https://googer.site",
    likes: 44, comments: 3, views: 1250, shares: 6,
  ),
  HomeAd(
    adId: "9002", campaignType: "Profile Promote",
    title: "nimasha", description: "Creator · Lifestyle",
    username: "nimasha", fullName: "Nimasha Perera", avatar: "https://i.pravatar.cc/80?img=47",
  ),
];

// Demo user (auth falls back to this when the backend is unreachable)
class DemoUser {
  static const username = "sandil";
  static const fullName = "Sandil Dilmith";
  static const email = "sandildilmith12@gmail.com";
  static const googerId = "GGR-102-4457";
  static const avatar = "https://i.pravatar.cc/160?img=12";
  static const balance = 2450.75;
}
