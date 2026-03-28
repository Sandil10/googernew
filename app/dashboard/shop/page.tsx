"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import IonIcon from "@/app/components/IonIcon";
// import AddProductModal from "@/app/components/AddProductModal"; // Global now
import { marketService } from "@/services/marketService";
import { authService } from "@/services/authService";
import { orderService } from "@/services/orderService";
import { useCart } from "@/app/context/CartContext";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";

const SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "mm", "cm"];
const UOMS = [
  "Piece", "Pair", "Set", "Kg", "Gram", "Litre", "ML", "Pack", "Box", "Dozon",
  "Metre", "Yard", "Foot", "Inch", "mm", "cm", "Sq Ft", "Roll", "Bundle", "Bag", "Bottle", "Can",
  "Carton", "Pallet", "Unit", "Service", "Hour", "Day", "Month"
];

const COLORS = [
  { name: "None", hex: "transparent" },
  { name: "Alice Blue", hex: "#F0F8FF" },
  { name: "Antique White", hex: "#FAEBD7" },
  { name: "Aqua", hex: "#00FFFF" },
  { name: "Aquamarine", hex: "#7FFFD4" },
  { name: "Azure", hex: "#F0FFFF" },
  { name: "Beige", hex: "#F5F5DC" },
  { name: "Bisque", hex: "#FFE4C4" },
  { name: "Black", hex: "#000000" },
  { name: "Blanched Almond", hex: "#FFEBCD" },
  { name: "Blue", hex: "#0000FF" },
  { name: "Blue Violet", hex: "#8A2BE2" },
  { name: "Brown", hex: "#A52A2A" },
  { name: "Burly Wood", hex: "#DEB887" },
  { name: "Cadet Blue", hex: "#5F9EA0" },
  { name: "Chartreuse", hex: "#7FFF00" },
  { name: "Chocolate", hex: "#D2691E" },
  { name: "Coral", hex: "#FF7F50" },
  { name: "Cornflower Blue", hex: "#6495ED" },
  { name: "Cornsilk", hex: "#FFF8DC" },
  { name: "Crimson", hex: "#DC143C" },
  { name: "Cyan", hex: "#00FFFF" },
  { name: "Dark Blue", hex: "#00008B" },
  { name: "Dark Cyan", hex: "#008B8B" },
  { name: "Dark Goldenrod", hex: "#B8860B" },
  { name: "Dark Gray", hex: "#A9A9A9" },
  { name: "Dark Green", hex: "#006400" },
  { name: "Dark Khaki", hex: "#BDB76B" },
  { name: "Dark Magenta", hex: "#8B008B" },
  { name: "Dark Olive Green", hex: "#556B2F" },
  { name: "Dark Orange", hex: "#FF8C00" },
  { name: "Dark Orchid", hex: "#9932CC" },
  { name: "Dark Red", hex: "#8B0000" },
  { name: "Dark Salmon", hex: "#E9967A" },
  { name: "Dark Sea Green", hex: "#8FBC8F" },
  { name: "Dark Slate Blue", hex: "#483D8B" },
  { name: "Dark Slate Gray", hex: "#2F4F4F" },
  { name: "Dark Turquoise", hex: "#00CED1" },
  { name: "Dark Violet", hex: "#9400D3" },
  { name: "Deep Pink", hex: "#FF1493" },
  { name: "Deep Sky Blue", hex: "#00BFFF" },
  { name: "Dim Gray", hex: "#696969" },
  { name: "Dodger Blue", hex: "#1E90FF" },
  { name: "Fire Brick", hex: "#B22222" },
  { name: "Floral White", hex: "#FFFAF0" },
  { name: "Forest Green", hex: "#228B22" },
  { name: "Fuchsia", hex: "#FF00FF" },
  { name: "Gainsboro", hex: "#DCDCDC" },
  { name: "Ghost White", hex: "#F8F8FF" },
  { name: "Gold", hex: "#FFD700" },
  { name: "Goldenrod", hex: "#DAA520" },
  { name: "Gray", hex: "#808080" },
  { name: "Green", hex: "#008000" },
  { name: "Green Yellow", hex: "#ADFF2F" },
  { name: "Honey Dew", hex: "#F0FFF0" },
  { name: "Hot Pink", hex: "#FF69B4" },
  { name: "Indian Red", hex: "#CD5C5C" },
  { name: "Indigo", hex: "#4B0082" },
  { name: "Ivory", hex: "#FFFFF0" },
  { name: "Khaki", hex: "#F0E68C" },
  { name: "Lavender", hex: "#E6E6FA" },
  { name: "Lavender Blush", hex: "#FFF0F5" },
  { name: "Lawn Green", hex: "#7CFC00" },
  { name: "Lemon Chiffon", hex: "#FFFACD" },
  { name: "Light Blue", hex: "#ADD8E6" },
  { name: "Light Coral", hex: "#F08080" },
  { name: "Light Cyan", hex: "#E0FFFF" },
  { name: "Light Goldenrod Yellow", hex: "#FAFAD2" },
  { name: "Light Gray", hex: "#D3D3D3" },
  { name: "Light Green", hex: "#90EE90" },
  { name: "Light Pink", hex: "#FFB6C1" },
  { name: "Light Salmon", hex: "#FFA07A" },
  { name: "Light Sea Green", hex: "#20B2AA" },
  { name: "Light Sky Blue", hex: "#87CEFA" },
  { name: "Light Slate Gray", hex: "#778899" },
  { name: "Light Steel Blue", hex: "#B0C4DE" },
  { name: "Light Yellow", hex: "#FFFFE0" },
  { name: "Lime", hex: "#00FF00" },
  { name: "Lime Green", hex: "#32CD32" },
  { name: "Linen", hex: "#FAF0E6" },
  { name: "Magenta", hex: "#FF00FF" },
  { name: "Maroon", hex: "#800000" },
  { name: "Medium Aquamarine", hex: "#66CDAA" },
  { name: "Medium Blue", hex: "#0000CD" },
  { name: "Medium Orchid", hex: "#BA55D3" },
  { name: "Medium Purple", hex: "#9370DB" },
  { name: "Medium Sea Green", hex: "#3CB371" },
  { name: "Medium Slate Blue", hex: "#7B68EE" },
  { name: "Medium Spring Green", hex: "#00FA9A" },
  { name: "Medium Turquoise", hex: "#48D1CC" },
  { name: "Medium Violet Red", hex: "#C71585" },
  { name: "Midnight Blue", hex: "#191970" },
  { name: "Mint Cream", hex: "#F5FFFA" },
  { name: "Misty Rose", hex: "#FFE4E1" },
  { name: "Moccasin", hex: "#FFE4B5" },
  { name: "Navajo White", hex: "#FFDEAD" },
  { name: "Navy", hex: "#000080" },
  { name: "Old Lace", hex: "#FDF5E6" },
  { name: "Olive", hex: "#808000" },
  { name: "Olive Drab", hex: "#6B8E23" },
  { name: "Orange", hex: "#FFA500" },
  { name: "Orange Red", hex: "#FF4500" },
  { name: "Orchid", hex: "#DA70D6" },
  { name: "Pale Goldenrod", hex: "#EEE8AA" },
  { name: "Pale Green", hex: "#98FB98" },
  { name: "Pale Turquoise", hex: "#AFEEEE" },
  { name: "Pale Violet Red", hex: "#DB7093" },
  { name: "Papaya Whip", hex: "#FFEFD5" },
  { name: "Peach Puff", hex: "#FFDAB9" },
  { name: "Peru", hex: "#CD853F" },
  { name: "Pink", hex: "#FFC0CB" },
  { name: "Plum", hex: "#DDA0DD" },
  { name: "Powder Blue", hex: "#B0E0E6" },
  { name: "Purple", hex: "#800080" },
  { name: "Rebecca Purple", hex: "#663399" },
  { name: "Red", hex: "#FF0000" },
  { name: "Rosy Brown", hex: "#BC8F8F" },
  { name: "Royal Blue", hex: "#4169E1" },
  { name: "Saddle Brown", hex: "#8B4513" },
  { name: "Salmon", hex: "#FA8072" },
  { name: "Sandy Brown", hex: "#F4A460" },
  { name: "Sea Green", hex: "#2E8B57" },
  { name: "Sea Shell", hex: "#FFF5EE" },
  { name: "Sienna", hex: "#A0522D" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Sky Blue", hex: "#87CEEB" },
  { name: "Slate Blue", hex: "#6A5ACD" },
  { name: "Slate Gray", hex: "#708090" },
  { name: "Snow", hex: "#FFFAFA" },
  { name: "Spring Green", hex: "#00FF7F" },
  { name: "Steel Blue", hex: "#4682B4" },
  { name: "Tan", hex: "#D2B48C" },
  { name: "Teal", hex: "#008080" },
  { name: "Thistle", hex: "#D8BFD8" },
  { name: "Tomato", hex: "#FF6347" },
  { name: "Turquoise", hex: "#40E0D0" },
  { name: "Violet", hex: "#EE82EE" },
  { name: "Wheat", hex: "#F5DEB3" },
  { name: "White", hex: "#FFFFFF" },
  { name: "White Smoke", hex: "#F5F5F5" },
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Yellow Green", hex: "#9ACD32" },
  { name: "Midnight Black", hex: "#0B0B0B" },
  { name: "Space Gray", hex: "#343D46" },
  { name: "Rose Gold", hex: "#B76E79" },
  { name: "Champagne", hex: "#F7E7CE" },
  { name: "Emerald", hex: "#50C878" },
  { name: "Ruby", hex: "#E0115F" },
  { name: "Sapphire Blue", hex: "#0F52BA" },
  { name: "Amethyst", hex: "#9966CC" },
  { name: "Amber Gold", hex: "#FFBF00" },
  { name: "Coral Pink", hex: "#F88379" },
  { name: "Mint Green", hex: "#98FF98" },
  { name: "Lavender Purple", hex: "#967BB6" },
  { name: "Charcoal Gray", hex: "#36454F" },
  { name: "Ocean Blue", hex: "#0077BE" },
  { name: "Desert Sand", hex: "#EDC9AF" },
  { name: "Burgundy Red", hex: "#800020" },
  { name: "Olive Green", hex: "#808000" },
  { name: "Mustard Yellow", hex: "#FFDB58" },
  { name: "Peach Orange", hex: "#FFCC99" },
  { name: "Tiffany Blue", hex: "#0ABAB5" },
  { name: "Periwinkle Blue", hex: "#CCCCFF" },
  { name: "Cotton Candy", hex: "#FFBCD9" },
  { name: "Slate Gray", hex: "#708090" },
  { name: "Stormy Sky", hex: "#778899" },
  { name: "Forest Green", hex: "#228B22" },
  { name: "Electric Purple", hex: "#BF00FF" },
  { name: "Neon Green", hex: "#39FF14" },
  { name: "Ice White", hex: "#F0F8FF" },
  { name: "Off White", hex: "#FAF9F6" },
  { name: "Creamy Beige", hex: "#F5F5DC" },
  { name: "Mocha", hex: "#A38068" },
  { name: "Caramel Brown", hex: "#AF6F09" },
  { name: "Honey Gold", hex: "#EBA937" },
  { name: "Copper Metallic", hex: "#B87333" },
  { name: "Bronze Dust", hex: "#CD7F32" },
  { name: "Titanium Silver", hex: "#878681" },
  { name: "Jet Black Matte", hex: "#0A0A0A" },
  { name: "Cool Cyan", hex: "#00FFFF" },
  { name: "Deep Indigo", hex: "#310062" },
  { name: "Lavender Blush", hex: "#FFF0F5" },
  { name: "Cherry Red", hex: "#D2042D" },
  { name: "Wine Red", hex: "#722F37" },
  { name: "Berry Purple", hex: "#990F4B" },
  { name: "Plum Deep", hex: "#673147" },
  { name: "Midnight Navy", hex: "#191970" },
  { name: "Teal Deep", hex: "#004B49" },
  { name: "Pine Green", hex: "#01796F" },
  { name: "Apple Green", hex: "#8DB600" },
  { name: "Lemon Fizz", hex: "#FFF700" },
  { name: "Sunset Gold", hex: "#FFD700" },
  { name: "Pumpkin Orange", hex: "#FF7518" },
  { name: "Rust Brown", hex: "#B7410E" },
  { name: "Cinnamon", hex: "#D2691E" },
  { name: "Terracotta", hex: "#E2725B" },
  { name: "Sandstone", hex: "#766352" },
  { name: "Taupe Gray", hex: "#8B8589" },
  { name: "Pebble Gray", hex: "#D1D1D1" },
  { name: "Cloud White", hex: "#F8F8FF" },
  { name: "Pearl White", hex: "#F0EAD6" },
  { name: "Eggshell White", hex: "#FBF5E6" },
  { name: "Lilac Mist", hex: "#C8A2C8" },
  { name: "Thistle Bloom", hex: "#D8BFD8" },
  { name: "Sky Blue Light", hex: "#E0FFFF" },
  { name: "Baby Pink", hex: "#F4C2C2" },
];

// Moved outside ShopPage to prevent remounting issues
const InteractionButton = memo(({
  icon,
  activeIcon,
  count,
  color,
  activeColor,
  isActive,
  onSingleClick,
  onLongReach,
  type,
  orientation = "horizontal",
  iconSize = "text-base md:text-xl",
}: any) => {
  const timerRef = useRef<any>(null);
  const longPressedRef = useRef(false);

  const handleStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongReach();
    }, 600);
  };

  const handleEnd = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!longPressedRef.current) {
      onSingleClick();
    }
    longPressedRef.current = false;
  };

  const handleCancel = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    longPressedRef.current = false;
  };

  const currentIcon = isActive && activeIcon ? activeIcon : icon;
  const currentColorClass = isActive ? activeColor : `text-white/40 hover:text-white`;

  return (
    <button
      type="button"
      data-interaction-type={type}
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerLeave={handleCancel}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className={`${currentColorClass} transition-all duration-300 active:scale-75 flex ${orientation === "vertical" ? "flex-col" : "items-center"} gap-0.5 focus:outline-none focus:ring-0 select-none cursor-pointer touch-none`}
    >
      <IonIcon name={currentIcon} className={iconSize} />
      {count > 0 && <span className="text-[9px] font-bold">{count}</span>}
    </button>
  );
});

InteractionButton.displayName = "InteractionButton";

interface MarketItemWrapperProps {
  product: any;
  children: React.ReactNode;
  isCompact?: boolean;
  onView?: (id: number) => void;
  activeTab?: string;
}

const MarketItemWrapper = memo(
  ({
    product,
    children,
    onView,
    activeTab,
  }: MarketItemWrapperProps) => {
    useEffect(() => {
      // "When a user sees a product for the first time... it should automatically count as 1 view."
      if (product?.id && activeTab === "market" && onView) {
        onView(product.id);
      }
    }, [product?.id, activeTab, onView]);

    return <>{children}</>;
  },
);

MarketItemWrapper.displayName = "MarketItemWrapper";

function formatRelativeTime(dateString: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";

  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export default function ShopPage() {
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("market"); // market, my-products, orders
  const [myListingsTab, setMyListingsTab] = useState("active");
  const [myListingsSubTab, setMyListingsSubTab] = useState("all"); // for Your Products sub-filter
  const [myOrdersTab, setMyOrdersTab] = useState("all"); // all, processing, shipped, delivered, returns
  const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(""); // Filter state
  const [products, setProducts] = useState<any[]>([]);
  const [isBottomSheetLoading, setIsBottomSheetLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareProduct, setShareProduct] = useState<any>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [productComments, setProductComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [interactionProduct, setInteractionProduct] = useState<any>(null);
  const [bottomSheetType, setBottomSheetType] = useState<
    "likes" | "comments" | "shares" | "views"
  >("comments");
  const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
  const [openMenuProductId, setOpenMenuProductId] = useState<number | null>(
    null,
  );
  const [hiddenProductIds, setHiddenProductIds] = useState<number[]>([]);
  const [reportingProduct, setReportingProduct] = useState<any>(null);
  const [isMenuOpenModal, setIsMenuOpenModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [likedProductIds, setLikedProductIds] = useState<Set<number>>(new Set());
  const [inactiveProducts, setInactiveProducts] = useState<any[]>([]);

  useEffect(() => {
    if (selectedProduct?.id) {
      loadComments(selectedProduct.id);
    }
  }, [selectedProduct?.id]);

  const loadComments = async (id: number) => {
    try {
      const data = await marketService.getComments(id);
      setProductComments(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComment = async () => {
    if (!selectedProduct || !newComment.trim()) return;
    if (!currentUser) return alert("Please login to comment");
    try {
      const comment = await marketService.addComment(
        selectedProduct.id,
        newComment,
      );
      // Append real username/profile if available from currentUser
      const commentData = {
        ...comment,
        username: currentUser.username,
        profile_picture: currentUser.profile_picture,
      };
      setProductComments((prev) => [commentData, ...prev]);
      setNewComment("");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selectedProduct.id
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p,
        ),
      );

      // If bottom sheet is open, refresh comments
      if (isBottomSheetOpen && bottomSheetType === "comments") {
        const comments = await marketService.getComments(selectedProduct.id);
        setBottomSheetData(comments);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendComment = async (text: string) => {
    const targetProduct = interactionProduct || selectedProduct;
    if (!targetProduct) return;

    try {
      const comment = await marketService.addComment(targetProduct.id, text);
      const commentData = {
        ...comment,
        username: currentUser?.username || "You",
        profile_picture: currentUser?.profile_picture,
      };
      setBottomSheetData((prev) => [commentData, ...prev]);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === targetProduct.id
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p,
        ),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleLike = async (id: number) => {
    try {
      const liked = await marketService.toggleLike(id);
      setLikedProductIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(id);
        else next.delete(id);
        return next;
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, likes_count: (p.likes_count || 0) + (liked ? 1 : -1) }
            : p,
        ),
      );

      // IMPORTANT: Update selectedProduct if modal is open for this ID
      if (selectedProduct?.id === id) {
        setSelectedProduct((prev: any) => ({
          ...prev,
          likes_count: (prev.likes_count || 0) + (liked ? 1 : -1),
        }));
      }

      // If bottom sheet is open for likes, refresh it in Real Time
      if (
        isBottomSheetOpen &&
        bottomSheetType === "likes" &&
        interactionProduct?.id === id
      ) {
        const likes = (await marketService.getLikes?.(id)) || [];
        setBottomSheetData(likes);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openBottomSheet = async (
    type: "likes" | "comments" | "shares" | "views",
    product: any,
  ) => {
    setBottomSheetType(type);
    setInteractionProduct(product);
    setIsBottomSheetOpen(true);
    setBottomSheetData([]); // Loading state
    setIsBottomSheetLoading(true);

    try {
      let data = [];
      if (type === "comments") {
        data = await marketService.getComments(product.id);
      } else if (type === "likes") {
        // Assuming marketService.getLikes exists or we can use toggle history
        data = (await marketService.getLikes?.(product.id)) || [];
      } else if (type === "shares") {
        data = (await marketService.getShares?.(product.id)) || [];
      } else if (type === "views") {
        data = (await marketService.getViews?.(product.id)) || [];
      }
      setBottomSheetData(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsBottomSheetLoading(false);
    }
  };

  // dragging states removed — no icon popup on long press

  const handleLogShare = async (id: number) => {
    try {
      await marketService.logShare(id);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, shares_count: (p.shares_count || 0) + 1 } : p,
        ),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogView = async (id: number) => {
    try {
      const result = await marketService.logView(id);
      // Update view count locally if backend confirmed an increment
      if (result?.incremented !== false) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, views_count: (p.views_count || 0) + 1 } : p,
          ),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // InteractionButton is now outside ShopPage

  const categories = [
    "Gamings",
    "Headphones",
    "Parfums",
    "Fruits",
    "Mobiles",
    "Laptops",
    "Accessories",
    "Shoes",
    "Clothing",
    "Electronics",
    "Fashion",
    "Other",
  ];

  useEffect(() => {
    setMounted(true);
    loadUser();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [
    activeTab,
    myListingsTab,
    myListingsSubTab,
    myOrdersTab,
    currentUser,
    selectedCategory,
  ]);

  // Load inactive products for market tab
  useEffect(() => {
    if (activeTab === "market") {
      marketService.getItems({ status: "inactive" }).then((data: any[]) => {
        setInactiveProducts(data || []);
      }).catch(() => setInactiveProducts([]));
    }
  }, [activeTab]);

  useEffect(() => {
    const handleRefresh = () => refresh();
    window.addEventListener("product-added", handleRefresh);
    return () => window.removeEventListener("product-added", handleRefresh);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuProductId(null);
    if (openMenuProductId) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => window.removeEventListener("click", handleClickOutside);
  }, [openMenuProductId]);

  const loadUser = async () => {
    try {
      const user = await authService.getProfile();
      setCurrentUser(user);
    } catch (e) {
      console.error("Not logged in");
    }
  };

  // Cart logic
  const { addToCart } = useCart();

  const loadProducts = async () => {
    setLoading(true);
    try {
      let data = [];
      const filters: any = {};
      if (activeTab === "market") {
        filters.status = "approved";
        data = await marketService.getItems(filters);
      } else if (activeTab === "my-products") {
        if (currentUser?.id) {
          if (myListingsTab === "all") {
            // "Your Orders" (Seller Side)
            // If sub-tab is 'all', we might want to show everything or just pending?
            // User says 'All Orders' shows admin-approved products.
            // For demo, I'll fetch orders. If 'all', I'll show all including pending.
            let statusFilter =
              myListingsSubTab === "all" ? "" : myListingsSubTab;
            if (myListingsSubTab === "delivered")
              statusFilter = "delivered,received";
            data = await orderService.getSellerOrders({ status: statusFilter });
          } else if (myListingsTab === "active") {
            data = await marketService.getItems({
              user_id: currentUser.id,
              status: "approved",
            });
          } else if (myListingsTab === "reviewing") {
            data = await marketService.getItems({
              user_id: currentUser.id,
              status: "reviewing,rejected",
            });
          } else if (myListingsTab === "deleted") {
            data = await marketService.getItems({
              user_id: currentUser.id,
              status: "deleted",
            });
          }
        }
      } else if (activeTab === "orders") {
        if (currentUser?.id) {
          let statusFilter = myOrdersTab === "all" ? "" : myOrdersTab;
          if (myOrdersTab === "delivered") statusFilter = "delivered,received";
          data = await orderService.getBuyerOrders({ status: statusFilter });
        }
      }

      if (selectedCategory && activeTab === "market") {
        // Already handled by filters if passed to marketService.getItems
        // But for orders, maybe category doesn't apply the same way?
        // Mostly user wants categories for the public marketplace.
      }
      // data = await marketService.getItems(filters); // original logic was slightly different branching
      // Let's stick to original structure but add category
      /*
            if (activeTab === "market") {
                data = await marketService.getItems({ status: 'approved', category: selectedCategory || undefined });
            } else if (activeTab === "my-products") {
                if (currentUser?.id) {
                    data = await marketService.getItems({ user_id: currentUser.id, status: 'approved', category: selectedCategory || undefined });
                }
            } else if (activeTab === "reviewing") {
                if (currentUser?.id) {
                    data = await marketService.getItems({ user_id: currentUser.id, status: 'reviewing', category: selectedCategory || undefined });
                }
            }
            */
      setProducts(data || []);
    } catch (e) {
      console.error("Failed to load products", e);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    loadProducts();
    if (activeTab !== "market") {
      setActiveTab("my-products");
      setMyListingsTab("reviewing");
    }
    setEditingProduct(null);
    setIsCategoriesDrawerOpen(false);
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("Are you sure you want to delete this listing?")) return;
    try {
      await marketService.deleteItem(id);
      setSelectedProduct(null);
      loadProducts();
    } catch (e) {
      console.error("Failed to delete product", e);
      alert("Failed to delete product. Please try again.");
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setSelectedProduct(null);
    // setIsModalOpen(true);
    window.dispatchEvent(
      new CustomEvent("open-add-product-modal", { detail: product }),
    );
  };

  const handleBuyItem = async (itemId: number) => {
    if (!currentUser) return alert("Please login to buy items");
    if (!selectedProduct) return;

    // Use currentVariant to get the selected color/image if available
    const currentVariant =
      selectedVariantIndex !== null
        ? (typeof selectedProduct.variants === "string"
          ? JSON.parse(selectedProduct.variants)
          : selectedProduct.variants || [])[selectedVariantIndex]
        : null;

    addToCart(
      selectedProduct,
      quantity,
      selectedSize,
      currentVariant?.color || "None",
      selectedVariantIndex,
    );

    // After adding, we can close the product modal if we want (user said "when buy now click needs to be added to cart")
    setSelectedProduct(null);
    setSelectedVariantIndex(null);
    setSelectedSize(null);
  };

  const handleUpdateOrderStatus = async (orderId: number, status: string) => {
    try {
      await orderService.updateStatus(orderId, status);
      loadProducts(); // Fresh results
    } catch (e: any) {
      alert(e.message || "Failed to update status");
    }
  };

  const handleNotInterested = (productId: number) => {
    setHiddenProductIds((prev) => [...prev, productId]);
    setOpenMenuProductId(null);
  };

  const handleReportSubmit = (productId: number) => {
    alert(`Product ${productId} has been reported to admin for review.`);
    setReportingProduct(null);
    setOpenMenuProductId(null);
  };



  return (
    <div className="pb-10 relative min-h-screen">
      {/* Search Portal for Mobile Topbar */}
      {mounted &&
        document.getElementById("shop-search-portal") &&
        createPortal(
          <div className="w-full relative">
            <input
              type="text"
              placeholder="Product Search"
              className="w-full bg-[#1a1a1a] text-white text-xs rounded-full pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-white/30 border border-white/10 placeholder:text-white"
            />
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm flex items-center">
              <IonIcon name="search-outline" />
            </div>
          </div>,
          document.getElementById("shop-search-portal")!,
        )}

      <h1 className="text-3xl font-bold mb-6 text-white hidden md:block">
        Marketplace
      </h1>

      {/* Header: Tabs + Search (Desktop) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
        {/* Tabs */}
        <div className="flex items-center gap-2 w-full md:w-auto relative">
          <div
            id="tabs-scroll"
            className="flex gap-8 border-b border-gray-800 w-full md:w-auto overflow-x-auto scroll-smooth scrollbar-none px-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <button
              onClick={() => setActiveTab("market")}
              className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "market" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
            >
              <div className="flex items-center gap-2">
                <IonIcon name="storefront-outline" />
                Market
              </div>
              {activeTab === "market" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("my-products")}
              className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "my-products" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
            >
              <div className="flex items-center gap-2">
                <IonIcon name="pricetags-outline" />
                My Listings
              </div>
              {activeTab === "my-products" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("orders")}
              className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "orders" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
            >
              <div className="flex items-center gap-2">
                <IonIcon name="cart-outline" />
                My Orders
              </div>
              {activeTab === "orders" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
              )}
            </button>
          </div>
        </div>

        {/* Search & Filter (Desktop only - mobile uses portal) */}
        <div className="hidden md:flex items-center gap-4 flex-1 md:max-w-md">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Product Search"
              className="w-full bg-[#1a1a1a] text-white text-sm rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-white/30 border border-white/10 placeholder:text-white"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg flex items-center">
              <IonIcon name="search-outline" />
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs for My Listings */}
      {activeTab === "my-products" && (
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center gap-2 select-none">
            <button
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
              onClick={() =>
                document
                  .getElementById("mylisting-scroll")
                  ?.scrollBy({ left: -150, behavior: "smooth" })
              }
            >
              <IonIcon name="chevron-back" className="text-lg" />
            </button>
            <div
              id="mylisting-scroll"
              className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth"
            >
              {[
                {
                  id: "active",
                  label: "Active Products",
                  icon: "checkmark-circle",
                },
                { id: "all", label: "My Orders", icon: "receipt" },
                {
                  id: "reviewing",
                  label: products.some((p) => p.status === "rejected")
                    ? "Rejected Products"
                    : "Review Products",
                  icon: products.some((p) => p.status === "rejected")
                    ? "close-circle"
                    : "time",
                },
                { id: "deleted", label: "Inactive Products", icon: "trash" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMyListingsTab(tab.id)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                        ${myListingsTab === tab.id
                      ? "bg-white text-black shadow-lg shadow-white/5 scale-[1.02]"
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <IonIcon
                    name={
                      tab.icon + (myListingsTab === tab.id ? "" : "-outline")
                    }
                    className="text-sm"
                  />
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
              onClick={() =>
                document
                  .getElementById("mylisting-scroll")
                  ?.scrollBy({ left: 150, behavior: "smooth" })
              }
            >
              <IonIcon name="chevron-forward" className="text-lg" />
            </button>
          </div>

          {/* Category Sub-tabs for "Your Products" */}
          {myListingsTab === "all" && (
            <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] rounded-2xl w-full md:w-fit overflow-x-auto no-scrollbar border border-white/5">
              {[
                { id: "all", label: "All Orders", icon: "list" },
                { id: "processing", label: "Processing", icon: "sync" },
                { id: "shipped", label: "Shipped", icon: "airplane" },
                { id: "delivered", label: "Delivered", icon: "cube" },
                { id: "returns", label: "Returns", icon: "refresh-circle" },
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setMyListingsSubTab(sub.id)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                                        ${myListingsSubTab === sub.id
                      ? "bg-white/10 text-white"
                      : "text-slate-600 hover:text-slate-400"
                    }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tabs for My Orders */}
      {activeTab === "orders" && (
        <div className="flex items-center gap-2 mb-8 select-none animate-in slide-in-from-left-4 duration-500">
          <button
            className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
            onClick={() =>
              document
                .getElementById("myorders-scroll")
                ?.scrollBy({ left: -150, behavior: "smooth" })
            }
          >
            <IonIcon name="chevron-back" className="text-lg" />
          </button>
          <div
            id="myorders-scroll"
            className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth"
          >
            {[
              { id: "all", label: "All Orders", icon: "receipt" },
              { id: "processing", label: "Processing", icon: "sync" },
              { id: "shipped", label: "Shipped", icon: "airplane" },
              { id: "delivered", label: "Delivered", icon: "cube" },
              { id: "returns", label: "Returns", icon: "refresh-circle" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMyOrdersTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                    ${myOrdersTab === tab.id
                    ? "bg-white text-black shadow-lg shadow-white/5 scale-[1.02]"
                    : "text-slate-500 hover:text-white hover:bg-white/5"
                  }`}
              >
                <IonIcon
                  name={tab.icon + (myOrdersTab === tab.id ? "" : "-outline")}
                  className="text-sm"
                />
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
            onClick={() =>
              document
                .getElementById("myorders-scroll")
                ?.scrollBy({ left: 150, behavior: "smooth" })
            }
          >
            <IonIcon name="chevron-forward" className="text-lg" />
          </button>
        </div>
      )}

      {/* Categories - Only visible in Market */}
      {activeTab === "market" && (
        <div className="flex items-center gap-2 mb-8 select-none">
          <button
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
            onClick={() =>
              document
                .getElementById("category-scroll")
                ?.scrollBy({ left: -150, behavior: "smooth" })
            }
          >
            <IonIcon name="chevron-back" className="text-lg" />
          </button>
          <div
            id="category-scroll"
            className="flex-1 flex gap-2 overflow-x-auto scroll-smooth py-1 no-scrollbar overflow-y-hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <button
              onClick={() => setSelectedCategory("")}
              className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all border active:scale-95 shadow-sm shrink-0 ${selectedCategory === "" ? "bg-white text-black border-white" : "bg-[#1a1a1a] border-white/5 hover:border-white/20 text-gray-400 hover:text-white"}`}
            >
              All
            </button>
            {categories.map((cat, i) => (
              <button
                key={i}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all border active:scale-95 shadow-sm shrink-0 ${selectedCategory === cat ? "bg-white text-black border-white" : "bg-[#1a1a1a] border-white/5 hover:border-white/20 text-gray-400 hover:text-white"}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <button
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
            onClick={() =>
              document
                .getElementById("category-scroll")
                ?.scrollBy({ left: 150, behavior: "smooth" })
            }
          >
            <IonIcon name="chevron-forward" className="text-lg" />
          </button>
        </div>
      )}

      {/* Product Rendering */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white/[0.02] rounded-[3rem] border border-white/5 border-dashed">
          <IonIcon
            name={
              activeTab === "my-products" && myListingsTab === "reviewing"
                ? "time-outline"
                : "basket-outline"
            }
            className="text-4xl mb-3 opacity-20"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
            No items found here
          </p>
        </div>
      ) : activeTab === "orders" ||
        (activeTab === "my-products" && myListingsTab === "all") ? (
        /* Compact Horizontal Layout for Orders (Admin-style) */
        <div className="flex flex-col gap-4 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {products
            .filter((p) => !hiddenProductIds.includes(p.id))
            .map((item) => (
              <MarketItemWrapper
                key={item.id}
                product={item}
                isCompact={true}
                onView={handleLogView}
                activeTab={activeTab}
              >
                <div
                  className="bg-[#1a1a1a] rounded-[2rem] border border-white/5 hover:border-white/10 transition-all p-4 md:p-6 flex flex-col md:flex-row gap-6 group relative overflow-hidden"
                  onClick={() => {
                    setSelectedProduct(item);
                    handleLogView(item.id);
                  }}
                >
                  {/* Product Image (Left) */}
                  <div className="relative w-full md:w-40 aspect-square md:aspect-auto md:h-40 rounded-2xl overflow-hidden shrink-0 bg-black border border-white/5">
                    <Image
                      src={
                        item.image_url &&
                          (item.image_url.includes("uploads") ||
                            item.image_url.includes("\\"))
                          ? `/uploads/${item.image_url.split(/[\\/]/).pop()}`
                          : item.image_url || "https://picsum.photos/400/400"
                      }
                      alt={item.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                      <span className="text-[8px] font-black uppercase text-white tracking-widest">
                        {item.status}
                      </span>
                    </div>
                  </div>

                  {/* Info Section (Middle) */}
                  <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="min-w-0">
                          <h3 className="text-white text-lg font-black truncate uppercase tracking-tight group-hover:text-blue-400 transition-colors uppercase">
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 relative">
                              {item.profile_picture ? (
                                <Image
                                  src={item.profile_picture}
                                  alt="Avatar"
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-[8px] text-blue-400">
                                  <IonIcon name="person" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              {activeTab === "orders"
                                ? `Seller: @${item.owner_username || "Anonymous"}`
                                : `Buyer: @${item.buyer_username || "Customer"}`}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="text-[10px] font-black text-white/40">
                              R
                            </span>
                            <span className="text-xl font-black text-white tracking-tighter">
                              {item.promo_price || item.price}
                            </span>
                          </div>
                          <p className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
                            Order #{item.id}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded border border-blue-500/10 uppercase tracking-widest">
                          {item.category}
                        </span>
                        <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-[8px] font-black rounded border border-white/5 uppercase tracking-widest">
                          Qty: 1
                        </span>
                        <span className="px-2 py-0.5 bg-white/5 text-slate-500 text-[8px] font-black rounded border border-white/5 uppercase tracking-widest">
                          {new Date(
                            item.created_at || Date.now(),
                          ).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 opacity-60">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Actions (Bottom) */}
                    <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(item);
                            handleLogView(item.id);
                          }}
                          className="text-slate-500 hover:text-white transition-colors flex items-center gap-1"
                        >
                          <IonIcon
                            name="chatbubble-outline"
                            className="text-lg"
                          />
                          {item.comments_count > 0 && (
                            <span className="text-[9px] font-bold">
                              {item.comments_count}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareProduct(item);
                            setShowShareModal(true);
                            handleLogShare(item.id);
                          }}
                          className="text-slate-500 hover:text-white transition-colors flex items-center gap-1"
                        >
                          <IonIcon
                            name="share-social-outline"
                            className="text-lg"
                          />
                          {item.shares_count > 0 && (
                            <span className="text-[9px] font-bold">
                              {item.shares_count}
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {activeTab === "orders" ? (
                          /* Buyer Actions */
                          <>
                            {item.status === "delivered" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(item.id, "received");
                                }}
                                className="px-6 py-2 bg-green-500 text-black text-[10px] font-black uppercase rounded-xl hover:bg-green-400 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                              >
                                Confirm Receipt
                              </button>
                            ) : item.status === "received" ? (
                              <span className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-500 text-[10px] font-black uppercase rounded-xl border border-green-500/20">
                                <IonIcon name="checkmark-done" /> Completed
                              </span>
                            ) : (
                              <span className="px-4 py-2 bg-white/5 text-slate-400 text-[10px] font-black uppercase rounded-xl border border-white/5">
                                {item.status === "processing"
                                  ? "Being Packed"
                                  : item.status === "shipped"
                                    ? "In Transit"
                                    : "Pending"}
                              </span>
                            )}
                          </>
                        ) : (
                          /* Seller Actions (Sales) */
                          <>
                            {item.status === "pending" ||
                              item.status === "approved" ||
                              item.status === "all" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(
                                    item.id,
                                    "processing",
                                  );
                                }}
                                className="px-6 py-2 bg-white text-black text-[10px] font-black uppercase rounded-xl hover:bg-blue-50 transition-all shadow-lg active:scale-95"
                              >
                                Process Order
                              </button>
                            ) : item.status === "processing" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(item.id, "shipped");
                                }}
                                className="px-6 py-2 bg-blue-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                              >
                                Ship Now
                              </button>
                            ) : item.status === "shipped" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(item.id, "delivered");
                                }}
                                className="px-6 py-2 bg-green-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-green-500 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                              >
                                Mark Delivered
                              </button>
                            ) : item.status === "delivered" ? (
                              <span className="px-4 py-2 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase rounded-xl border border-blue-500/20">
                                Awaiting Receipt
                              </span>
                            ) : item.status === "received" ? (
                              <span className="px-4 py-2 bg-green-500/10 text-green-500 text-[10px] font-black uppercase rounded-xl border border-green-500/20">
                                Completed
                              </span>
                            ) : null}
                          </>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(item);
                            setSelectedVariantIndex(null);
                            setActivePreviewIndex(0);
                          }}
                          className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-inner"
                        >
                          <IonIcon name="eye-outline" className="text-lg" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </MarketItemWrapper>
            ))}
        </div>
      ) : (
        /* Grid Layout for Marketplace and My Listings */
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
          {products
            .filter((p) => !hiddenProductIds.includes(p.id))
            .map((product) => (
              <MarketItemWrapper
                key={product.id}
                product={product}
                onView={handleLogView}
                activeTab={activeTab}
              >
                <div
                  className="group cursor-pointer bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[2.5rem] pb-4 md:pb-8 border border-white/5 hover:border-white/20 transition-all hover:shadow-2xl relative flex flex-col min-w-0"
                  onClick={() => {
                    setSelectedProduct(product);
                    setSelectedVariantIndex(null);
                    setActivePreviewIndex(0);
                    handleLogView(product.id);
                  }}
                >
                  {/* Profile Header with Subscribe */}
                  <div className="flex items-center justify-between gap-1.5 p-3 md:p-4 md:px-5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-[8px] md:text-[10px] text-white overflow-hidden border border-white/10 shadow-lg relative flex-shrink-0">
                        {product.profile_picture ? (
                          <Image
                            src={product.profile_picture}
                            alt="Profile"
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <IonIcon name="person" className="text-white" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[8px] md:text-[10px] text-white font-black uppercase tracking-tight truncate leading-none">
                          {product.username ||
                            product.owner_username ||
                            "Anonymous"}
                        </span>
                        <span className="text-[6px] md:text-[7px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                          {formatRelativeTime(product.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert("Subscribed!");
                        }}
                        className="px-2 md:px-4 py-1 md:py-1.5 bg-white text-black text-[7px] md:text-[9px] font-black uppercase rounded-full shadow-lg active:scale-95 transition-all hover:bg-slate-200 flex-shrink-0"
                      >
                        <span className="md:hidden">Sub</span>
                        <span className="hidden md:inline">Subscribe</span>
                      </button>

                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuProductId(
                              openMenuProductId === product.id
                                ? null
                                : product.id,
                            );
                          }}
                          className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all active:scale-75"
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuProductId === product.id && (
                          <div
                            className="absolute right-0 top-full mt-2 w-32 md:w-40 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl py-2 z-[60] animate-in slide-in-from-top-2 duration-200 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {currentUser?.id === product.user_id ? (
                              <>
                                <button
                                  onClick={() => handleEditProduct(product)}
                                  className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                                >
                                  <IonIcon
                                    name="create-outline"
                                    className="text-blue-400"
                                  />
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteProduct(product.id)
                                  }
                                  className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-red-500 hover:bg-white/5 flex items-center gap-2 transition-colors border-t border-white/5"
                                >
                                  <IonIcon name="trash-outline" />
                                  Delete
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setReportingProduct(product);
                                    setOpenMenuProductId(null);
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                                >
                                  <IonIcon
                                    name="alert-circle-outline"
                                    className="text-yellow-500"
                                  />
                                  Report
                                </button>
                                <button
                                  onClick={() =>
                                    handleNotInterested(product.id)
                                  }
                                  className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors border-t border-white/5"
                                >
                                  <IonIcon
                                    name="eye-off-outline"
                                    className="text-slate-500"
                                  />
                                  Not Interested
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image Section */}
                  <div className="relative aspect-square mx-1.5 rounded-[1.8rem] md:rounded-[2.2rem] overflow-hidden mb-5 bg-black border border-white/5 shadow-inner">
                    <Image
                      src={
                        product.image_url &&
                          (product.image_url.includes("uploads") ||
                            product.image_url.includes("\\"))
                          ? `/uploads/${product.image_url.split(/[\\/]/).pop()}`
                          : product.image_url || "https://picsum.photos/400/400"
                      }
                      alt={product.title}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {product.status === "reviewing" &&
                      activeTab !== "orders" && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2 text-white">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white flex items-center justify-center bg-black/50">
                              <IonIcon
                                name="time"
                                className="text-xl md:text-2xl"
                              />
                            </div>
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-black/60 px-2 py-1 rounded-full border border-white/30">
                              Reviewing
                            </span>
                          </div>
                        </div>
                      )}

                    {/* Product Discount Badge on Image Box */}
                    {(() => {
                      try {
                        const comm =
                          typeof product.commission_info === "string"
                            ? JSON.parse(product.commission_info)
                            : product.commission_info;
                        const gComm = comm?.googer_commission;
                        if (gComm && parseFloat(gComm) > 0) {
                          return (
                            <div className="absolute bottom-3 right-3 z-10 px-2.5 py-1 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                              <span className="text-[10px] md:text-xs font-black text-green-500">
                                +{gComm}%
                              </span>
                            </div>
                          );
                        }
                      } catch (e) {
                        console.warn(
                          "Failed to parse commission_info for product",
                          product.id,
                        );
                      }
                      return null;
                    })()}
                    {product.status === "rejected" && (
                      <div className="absolute inset-0 bg-red-900/40 backdrop-blur-[2px] flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-white">
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-red-500 flex items-center justify-center bg-red-600/30">
                            <IonIcon
                              name="close"
                              className="text-xl md:text-2xl text-red-100"
                            />
                          </div>
                          <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-red-600/80 px-2 py-1 rounded-full border border-red-400">
                            Rejected
                          </span>
                        </div>
                      </div>
                    )}
                    {(activeTab === "orders" ||
                      (activeTab === "my-products" &&
                        myListingsTab === "all")) &&
                      product.status && (
                        <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                          <span className="text-[8px] font-black uppercase text-white tracking-widest">
                            {product.status}
                          </span>
                        </div>
                      )}
                  </div>

                  {/* Content Section */}
                  <div className="px-3 md:px-6 pb-2">
                    <h3 className="text-white text-[12px] font-black truncate mb-3 uppercase tracking-tight group-hover:text-blue-400 transition-colors uppercase">
                      {(product.title || "").split(" ")[0]}
                    </h3>

                    {/* Color variants loop */}
                    {(() => {
                      const productVariants =
                        typeof product.variants === "string"
                          ? JSON.parse(product.variants)
                          : product.variants || [];
                      const uniqueColors = Array.from(
                        new Set(
                          productVariants
                            .map((v: any) => v.color)
                            .filter((c: any) => c && c !== "None"),
                        ),
                      );

                      if (uniqueColors.length > 0) {
                        return (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {uniqueColors.map((colorName: any, idx) => {
                              const colorInfo = COLORS.find(
                                (c) => c.name === colorName,
                              );
                              if (!colorInfo) return null;
                              return (
                                <div
                                  key={idx}
                                  className="w-2.5 h-2.5 rounded-full border border-white/20 shadow-sm"
                                  style={{ backgroundColor: colorInfo.hex }}
                                  title={colorName}
                                />
                              );
                            })}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="flex flex-col mb-3">
                      {product.promo_price && (
                        <span className="text-[10px] text-slate-500 line-through font-bold opacity-60">
                          R {product.price}
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-2 mr-[-8px]">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs font-black text-white/40">
                            R
                          </span>
                          <span className="text-2xl font-black text-white tracking-tighter">
                            {product.promo_price || product.price}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(product);
                            handleLogView(product.id);
                          }}
                          className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-blue-400 transition-all active:scale-75 rounded-2xl border border-white/5 shadow-inner"
                        >
                          <IonIcon name="cart-outline" className="text-xl" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom action bar: 2-row on mobile, 1-row on desktop */}
                    <div className="border-t border-white/5 pt-1 md:pt-1.5 flex flex-col gap-2">
                      <div className="flex items-center gap-2 md:gap-3 w-full">
                        <InteractionButton
                          type="likes"
                          icon="heart-outline"
                          activeIcon="heart"
                          isActive={likedProductIds.has(product.id)}
                          count={product.likes_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => handleToggleLike(product.id)}
                          onLongReach={() => openBottomSheet("likes", product)}
                          product={product}
                        />
                        <InteractionButton
                          type="views"
                          icon="eye-outline"
                          activeIcon="eye"
                          count={product.views_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => {
                            handleLogView(product.id);
                          }}
                          onLongReach={() => openBottomSheet("views", product)}
                          product={product}
                        />
                        <InteractionButton
                          type="comments"
                          icon="chatbubble-outline"
                          activeIcon="chatbubble"
                          count={product.comments_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => {
                            setInteractionProduct(product);
                            openBottomSheet("comments", product);
                          }}
                          onLongReach={() => openBottomSheet("comments", product)}
                          product={product}
                        />
                        <InteractionButton
                          type="shares"
                          icon="share-social-outline"
                          activeIcon="share-social"
                          count={product.shares_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => {
                            setShareProduct(product);
                            setShowShareModal(true);
                          }}
                          onLongReach={() => openBottomSheet("shares", product)}
                          product={product}
                        />
                      </div>

                      {/* Row 2 (mobile: below icons | desktop: hidden since it's in row 1 via ml-auto) */}
                      {/* Context action buttons — shown only when needed */}
                      {(() => {
                        const actionBtn =
                          product.status === "rejected" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditProduct(product);
                              }}
                              className="px-3 py-1 bg-white/10 hover:bg-white hover:text-black text-white text-[9px] font-black uppercase rounded-lg transition-all whitespace-nowrap"
                            >
                              Edit
                            </button>
                          ) : activeTab === "my-products" &&
                            myListingsTab === "all" ? (
                            product.status === "pending" ||
                              product.status === "approved" ||
                              product.status === "all" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(
                                    product.id,
                                    "processing",
                                  );
                                }}
                                className="px-2 py-1 bg-white text-black text-[8px] font-black uppercase rounded-lg border border-white whitespace-nowrap"
                              >
                                Process
                              </button>
                            ) : product.status === "processing" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(
                                    product.id,
                                    "shipped",
                                  );
                                }}
                                className="px-2 py-1 bg-blue-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap"
                              >
                                Ship
                              </button>
                            ) : product.status === "shipped" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(
                                    product.id,
                                    "delivered",
                                  );
                                }}
                                className="px-2 py-1 bg-green-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap"
                              >
                                Deliver
                              </button>
                            ) : product.status === "delivered" ? (
                              <span className="text-[8px] text-blue-400 font-black uppercase whitespace-nowrap">
                                Wait Buyer
                              </span>
                            ) : product.status === "received" ? (
                              <span className="text-[8px] text-green-500 font-black uppercase whitespace-nowrap">
                                Done ✓
                              </span>
                            ) : null
                          ) : activeTab === "orders" ? (
                            product.status === "delivered" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOrderStatus(
                                    product.id,
                                    "received",
                                  );
                                }}
                                className="px-2 py-1 bg-green-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap"
                              >
                                Received?
                              </button>
                            ) : product.status === "received" ? (
                              <span className="text-[8px] text-green-500 font-black uppercase whitespace-nowrap">
                                Done ✓
                              </span>
                            ) : null
                          ) : null;

                        return actionBtn ? (
                          <div className="flex items-center">{actionBtn}</div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              </MarketItemWrapper>
            ))}
        </div>
      )}

      {/* Pagination */}
      {products.length > 0 && (
        <div className="flex justify-center items-center gap-2 mb-20 fade-in">
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
            {" "}
            <IonIcon name="chevron-back-outline" />{" "}
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-black font-black text-xs">
            1
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
            {" "}
            <IonIcon name="chevron-forward-outline" />{" "}
          </button>
        </div>
      )}

      {/* Inactive Products Section - only in market tab */}
      {activeTab === "market" && inactiveProducts.length > 0 && (
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <IonIcon name="archive" className="text-amber-500 text-sm" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-widest">Inactive Products</h2>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{inactiveProducts.length} product{inactiveProducts.length !== 1 ? "s" : ""} currently inactive</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 opacity-70">
            {inactiveProducts.map((product) => (
              <div
                key={product.id}
                className="group cursor-pointer bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[2.5rem] pb-4 md:pb-6 border border-amber-500/10 hover:border-amber-500/30 transition-all hover:shadow-2xl relative flex flex-col min-w-0"
                onClick={() => {
                  setSelectedProduct(product);
                  setSelectedVariantIndex(null);
                  setActivePreviewIndex(0);
                }}
              >
                {/* Inactive Badge */}
                <div className="absolute top-3 right-3 z-20 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                  <span className="text-[8px] font-black uppercase text-amber-500 tracking-widest">Inactive</span>
                </div>

                {/* Profile Header */}
                <div className="flex items-center gap-1.5 p-3 md:p-4 md:px-5">
                  <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-[8px] md:text-[10px] text-white overflow-hidden border border-white/10 shadow-lg relative flex-shrink-0">
                    {product.profile_picture ? (
                      <Image src={product.profile_picture} alt="Profile" fill className="object-cover" />
                    ) : (
                      <IonIcon name="person" className="text-white" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[8px] md:text-[10px] text-white font-black uppercase tracking-tight truncate leading-none">
                      {product.username || product.owner_username || "Anonymous"}
                    </span>
                    <span className="text-[6px] md:text-[7px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                      {formatRelativeTime(product.created_at)}
                    </span>
                  </div>
                </div>

                {/* Image Section */}
                <div className="relative aspect-square mx-1.5 rounded-[1.8rem] md:rounded-[2.2rem] overflow-hidden mb-4 bg-black border border-white/5 shadow-inner">
                  <Image
                    src={
                      product.image_url &&
                        (product.image_url.includes("uploads") || product.image_url.includes("\\"))
                        ? `/uploads/${product.image_url.split(/[\\\/]/).pop()}`
                        : product.image_url || "https://picsum.photos/400/400"
                    }
                    alt={product.title}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500 grayscale-[40%]"
                  />
                  {/* Inactive overlay */}
                  <div className="absolute inset-0 bg-amber-900/20 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <IonIcon name="archive" className="text-amber-400 text-xl" />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="px-3 md:px-5">
                  <h3 className="text-white text-[11px] font-black truncate mb-1 uppercase tracking-tight">{product.title}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-black text-white/40">R</span>
                    <span className="text-xl font-black text-white/60 tracking-tighter">{product.promo_price || product.price}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Details Modal (Assuming existing code is mostly fine used selectedProduct state) */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => {
            setIsSizeDropdownOpen(false);
            setSelectedProduct(null);
            setActivePreviewIndex(0);
            setQuantity(1);
            setSelectedVariantIndex(null);
            setSelectedSize(null);
          }}
        >
          <div
            className="bg-[#121212] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full md:h-auto max-h-[95vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Side: Image Gallery */}
            <div className="w-full md:w-[45%] bg-[#0a0a0a] relative flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-white/5">
              {/* Top Navigation Bar */}
              <div className="h-16 md:h-20 bg-black flex items-center justify-between px-4 md:px-6 border-b border-white/5 shrink-0">
                <div
                  className="flex items-center gap-2 md:gap-3 cursor-pointer group"
                  onClick={() => {
                    setSelectedProduct(null);
                    setActivePreviewIndex(0);
                    setQuantity(1);
                    setSelectedVariantIndex(null);
                    setSelectedSize(null);
                    router.push(
                      `/dashboard/profile?id=${selectedProduct.user_id}`,
                    );
                  }}
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
                    {selectedProduct.profile_picture ? (
                      <Image
                        src={selectedProduct.profile_picture}
                        alt="Seller"
                        width={40}
                        height={40}
                        className="object-cover"
                      />
                    ) : (
                      <IonIcon name="person" className="text-white/40" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-blue-400 leading-tight">
                      Seller Profile
                    </h4>
                    <p className="text-[11px] md:text-sm font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                      {selectedProduct.owner_username ||
                        selectedProduct.username ||
                        "Anonymous Seller"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      alert("Subscribed!");
                    }}
                    className="px-3 md:px-5 py-1.5 md:py-2 bg-white text-black text-[9px] md:text-[11px] font-black uppercase rounded-full shadow-xl hover:bg-slate-200 transition-all active:scale-95 shrink-0"
                  >
                    Subscribe
                  </button>

                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpenModal(!isMenuOpenModal);
                      }}
                      className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/5 text-white flex items-center justify-center transition-all active:scale-75 shadow-inner"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      </div>
                    </button>

                    {/* Modal Dropdown Menu */}
                    {isMenuOpenModal && (
                      <div
                        className="absolute right-0 top-full mt-2 w-52 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl py-2 z-[70] animate-in slide-in-from-top-2 duration-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {currentUser?.id === selectedProduct.user_id ? (
                          <>
                            <button
                              onClick={() => {
                                handleEditProduct(selectedProduct);
                                setSelectedProduct(null);
                                setIsMenuOpenModal(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                            >
                              <IonIcon
                                name="create-outline"
                                className="text-blue-400"
                              />{" "}
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                handleDeleteProduct(selectedProduct.id);
                                setSelectedProduct(null);
                                setIsMenuOpenModal(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-red-500 hover:bg-white/5 flex items-center gap-2 transition-colors border-t border-white/5"
                            >
                              <IonIcon name="trash-outline" /> Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setReportingProduct(selectedProduct);
                                setSelectedProduct(null);
                                setIsMenuOpenModal(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                            >
                              <IonIcon
                                name="alert-circle-outline"
                                className="text-yellow-500"
                              />{" "}
                              Report
                            </button>
                            <button
                              onClick={() => {
                                handleNotInterested(selectedProduct.id);
                                setIsMenuOpenModal(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors border-t border-white/5"
                            >
                              <IonIcon
                                name="eye-off-outline"
                                className="text-slate-500"
                              />{" "}
                              Not Interested
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setActivePreviewIndex(0);
                    }}
                    className="w-10 h-10 rounded-full hover:bg-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-all bg-white/[0.03] border border-white/5 shadow-inner"
                  >
                    <IonIcon name="close" className="text-2xl" />
                  </button>
                </div>
              </div>

              {/* Main Preview */}
              <div className="relative flex-1 min-h-[140px] md:min-h-[450px]">
                {(() => {
                  const allImages = [
                    selectedProduct.image_url,
                    ...(Array.isArray(selectedProduct.variants)
                      ? selectedProduct.variants
                      : typeof selectedProduct.variants === "string"
                        ? JSON.parse(selectedProduct.variants)
                        : []
                    ).map((v: any) => v.url || v.image_url),
                  ].filter(Boolean);

                  // Remove duplicates
                  const uniqueImages = Array.from(new Set(allImages));
                  const currentImg =
                    uniqueImages[activePreviewIndex] || uniqueImages[0];

                  return (
                    <>
                      <Image
                        src={
                          currentImg &&
                            (currentImg.includes("uploads") ||
                              currentImg.includes("\\"))
                            ? `/uploads/${currentImg.split(/[\\/]/).pop()}`
                            : currentImg || "https://picsum.photos/400/400"
                        }
                        alt={selectedProduct.title}
                        fill
                        className="object-cover transition-all duration-500"
                      />

                      {/* Engagement Icons Overlay */}
                      <div className="absolute top-1/2 -translate-y-1/2 right-4 flex flex-col items-center gap-6 z-[60]">
                        <InteractionButton
                          type="likes"
                          icon="heart-outline"
                          activeIcon="heart"
                          isActive={likedProductIds.has(selectedProduct.id)}
                          count={selectedProduct.likes_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() =>
                            handleToggleLike(selectedProduct.id)
                          }
                          onLongReach={() =>
                            openBottomSheet("likes", selectedProduct)
                          }
                          orientation="vertical"
                          iconSize="text-2xl md:text-3xl"
                        />
                        <InteractionButton
                          type="views"
                          icon="eye-outline"
                          activeIcon="eye"
                          count={selectedProduct.views_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => {
                            handleLogView(selectedProduct.id);
                          }}
                          onLongReach={() =>
                            openBottomSheet("views", selectedProduct)
                          }
                          orientation="vertical"
                          iconSize="text-2xl md:text-3xl"
                        />
                        <InteractionButton
                          type="comments"
                          icon="chatbubble-outline"
                          activeIcon="chatbubble"
                          count={selectedProduct.comments_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => {
                            setInteractionProduct(selectedProduct);
                            openBottomSheet("comments", selectedProduct);
                          }}
                          onLongReach={() =>
                            openBottomSheet("comments", selectedProduct)
                          }
                          orientation="vertical"
                          iconSize="text-2xl md:text-3xl"
                        />
                        <InteractionButton
                          type="shares"
                          icon="share-social-outline"
                          activeIcon="share-social"
                          count={selectedProduct.shares_count}
                          color="text-white"
                          activeColor="text-white"
                          onSingleClick={() => {
                            setShareProduct(selectedProduct);
                            setShowShareModal(true);
                          }}
                          onLongReach={() =>
                            openBottomSheet("shares", selectedProduct)
                          }
                          orientation="vertical"
                          iconSize="text-2xl md:text-3xl"
                        />
                      </div>

                      {/* Product Discount Badge */}
                      {(() => {
                        const comm =
                          typeof selectedProduct.commission_info === "string"
                            ? JSON.parse(selectedProduct.commission_info)
                            : selectedProduct.commission_info;
                        const gComm = comm?.googer_commission;
                        if (gComm && parseFloat(gComm) > 0) {
                          return (
                            <div className="absolute bottom-4 right-4 z-20">
                              <div className="px-3 py-1 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-xl shadow-green-500/10">
                                <span className="text-[10px] md:text-sm font-black text-green-500 tracking-tighter">
                                  +{gComm}%
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </>
                  );
                })()}
              </div>

              {/* Thumbnails */}
              <div className="p-3 md:p-4 bg-black/40 backdrop-blur-md border-t border-white/5 overflow-x-auto no-scrollbar flex gap-2">
                {(() => {
                  const allImages = [
                    selectedProduct.image_url,
                    ...(Array.isArray(selectedProduct.variants)
                      ? selectedProduct.variants.map(
                        (v: any) => v.url || v.image_url,
                      )
                      : []),
                  ].filter(Boolean);
                  const uniqueImages = Array.from(new Set(allImages));

                  return uniqueImages.map((img: any, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setActivePreviewIndex(idx);
                        const isReviewMode = activeTab === "my-products" && myListingsTab === "reviewing";
                        if (isReviewMode) {
                          const productVariants = typeof selectedProduct.variants === "string" ? JSON.parse(selectedProduct.variants) : selectedProduct.variants || [];
                          const variantIdx = productVariants.findIndex((v: any) => (v.image_url || v.url) === img);
                          if (variantIdx !== -1) setSelectedVariantIndex(variantIdx);
                        }
                      }}
                      className={`relative w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl overflow-hidden cursor-pointer border-2 transition-all shrink-0 ${activePreviewIndex === idx ? "border-blue-500 scale-105 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"}`}
                    >
                      <Image
                        src={
                          img && (img.includes("uploads") || img.includes("\\"))
                            ? `/uploads/${img.split(/[\\/]/).pop()}`
                            : img || "https://picsum.photos/400/400"
                        }
                        alt="Thumb"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Right Side: Details */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-8">
                {(() => {
                  const isReviewMode = activeTab === "my-products" && myListingsTab === "reviewing";
                  const productVariants = typeof selectedProduct.variants === "string" ? JSON.parse(selectedProduct.variants) : selectedProduct.variants || [];
                  const shippingInfo = typeof selectedProduct.shipping_info === "string" ? JSON.parse(selectedProduct.shipping_info) : selectedProduct.shipping_info;
                  const commissionInfo = typeof selectedProduct.commission_info === "string" ? JSON.parse(selectedProduct.commission_info) : selectedProduct.commission_info;
                  const returnInfo = typeof selectedProduct.return_policy === "string" ? JSON.parse(selectedProduct.return_policy) : selectedProduct.return_policy;
                  const warrantyInfo = typeof selectedProduct.warranty_info === "string" ? JSON.parse(selectedProduct.warranty_info) : selectedProduct.warranty_info;

                  if (isReviewMode) {
                    const variantChoices = productVariants.length > 0 
                      ? productVariants.map((v: any, idx: number) => ({ ...v, color: v.color || "None", originalIndex: idx }))
                      : [{ color: "None", image_url: selectedProduct.image_url, originalIndex: null }];



                    const activeVariant = selectedVariantIndex !== null && productVariants[selectedVariantIndex] ? productVariants[selectedVariantIndex] : (productVariants[0] || selectedProduct);
                    const selValues = activeVariant?.selections || [];
                    
                    // Improved extraction logic checking for 'isUOM' flag or list inclusion
                    const extractedSizes = selValues.filter((v: any) => v.isUOM === false || (!v.hasOwnProperty('isUOM') && SIZES.includes(v.value))).map((v: any) => v.value);
                    const extractedUoms = selValues.filter((v: any) => v.isUOM === true || (!v.hasOwnProperty('isUOM') && UOMS.includes(v.value))).map((v: any) => v.value);

                    const activeSizes = [...new Set(extractedSizes)].join(", ") || (SIZES.includes(activeVariant?.size || activeVariant?.selection) ? (activeVariant?.size || activeVariant?.selection) : "");
                    const activeUom = [...new Set(extractedUoms)].join(", ") || (UOMS.includes(activeVariant?.uom) ? activeVariant?.uom : (activeVariant?.uom || selectedProduct.uom || "Piece"));
                    const activeColor = activeVariant?.color || "Standard";

                    return (
                      <div className="space-y-8 animate-in fade-in duration-500">
                        <div>
                          <h2 className="text-3xl font-black text-white tracking-tight leading-tight mb-2">
                            {selectedProduct.title}
                          </h2>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-0.5 bg-white/10 text-white text-[10px] font-black rounded border border-white/20 uppercase tracking-widest">
                              {selectedProduct.category}
                            </span>
                          </div>
                        </div>

                        {variantChoices.length > 1 && (
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Variant Inspection</h4>
                            <div className="flex flex-wrap gap-4 bg-white/[0.01] p-5 rounded-[2rem] border border-white/5">
                              {variantChoices.map((v: any, idx: number) => {
                                const isSelected = v.originalIndex === null ? selectedVariantIndex === null : selectedVariantIndex === v.originalIndex;
                                const img = v.image_url || v.url || selectedProduct.image_url;
                                const processedImg = img && (img.includes("uploads") || img.includes("\\")) ? `/uploads/${img.split(/[\\/]/).pop()}` : img;
                                return (
                                  <div 
                                    key={idx} 
                                    onClick={() => {
                                      setSelectedVariantIndex(v.originalIndex);
                                      const images = [selectedProduct.image_url, ...productVariants.map((v: any) => v.url || v.image_url)].filter(Boolean);
                                      const imgIndex = images.indexOf(v.image_url || v.url);
                                      if (imgIndex !== -1) setActivePreviewIndex(imgIndex);
                                    }}
                                    className={`group flex flex-col items-center gap-2 cursor-pointer transition-all ${isSelected ? "scale-105" : "opacity-40 hover:opacity-100"}`}
                                  >
                                    <div className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${isSelected ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-white/10"}`}>
                                      {processedImg && <Image src={processedImg} alt="V" width={48} height={48} className="w-full h-full object-cover" />}
                                    </div>
                                    <span className={`text-[7px] font-black uppercase tracking-widest ${isSelected ? "text-white" : "text-white/30"}`}>{v.color}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {selectedProduct.description && (
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Description</h4>
                            <p className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                              {selectedProduct.description}
                            </p>
                          </div>
                        )}

                        <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Pricing Breakdown</p>
                             <div className="flex items-center gap-6">
                               <div className="flex flex-col">
                                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Main Price</span>
                                 <span className="text-base font-black text-white/40 line-through">R {parseFloat(activeVariant?.price || selectedProduct.price || 0).toFixed(2)}</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-[8px] font-black text-green-400 uppercase tracking-widest">Promo Price</span>
                                 <span className="text-xl font-black text-white tracking-tighter">R {parseFloat(activeVariant?.promo_price || selectedProduct.promo_price || 0).toFixed(2)}</span>
                               </div>
                             </div>
                          </div>
                           <div className="px-5 py-3 bg-green-500/10 rounded-2xl border border-green-500/20 text-center">
                             <span className="text-[8px] font-black uppercase tracking-widest text-green-400 block mb-0.5">Reseller Commission</span>
                             <span className="text-base font-black text-white">R {commissionInfo?.resell_amount || '0.00'}</span>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-5 bg-white/[0.03] rounded-[2rem] border border-white/5 space-y-4">
                            {activeSizes && (
                              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Box Sizes</span>
                                <span className="text-xs font-black text-white">{activeSizes}</span>
                              </div>
                            )}
                            {activeUom && (
                              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">UOM</span>
                                <span className="text-xs font-black text-white">{activeUom}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Color</span>
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: COLORS.find(c => c.name === activeColor)?.hex || '#333' }} />
                                <span className="px-2 py-0.5 bg-white/10 rounded text-[9px] font-black text-white uppercase whitespace-nowrap">{activeColor}</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-5 bg-white/[0.03] rounded-[2rem] border border-white/5 space-y-4">
                            <div className="flex justify-between items-center pb-3 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Warranty</span>
                              <span className="text-xs font-black text-white uppercase">
                                {warrantyInfo?.warranty === 'Custom' ? warrantyInfo?.custom : (warrantyInfo?.warranty || 'No Warranty')}
                              </span>
                            </div>
                            <div className="flex justify-between items-center pb-3 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Return & Exchange</span>
                              <span className="text-xs font-black text-white">{returnInfo?.text || returnInfo?.date || "No Returns"}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Est. Delivery</span>
                              <span className="text-[10px] font-black text-white uppercase tracking-tight">
                                {(() => {
                                  const d1 = new Date();
                                  const d2 = new Date();
                                  d1.setDate(d1.getDate() + 4);
                                  d2.setDate(d2.getDate() + 8);
                                  const format = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                  return `${format(d1)} - ${format(d2)}`;
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                            <IonIcon name="earth-outline" className="text-blue-400" />
                            Active Delivery Countries
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {shippingInfo?.rates?.map((r: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
                                <span className="text-[10px] font-black text-white uppercase">{r.country}</span>
                                <span className="text-[9px] font-bold text-blue-400">R{r.charge}</span>
                              </div>
                            )) || <span className="text-[10px] italic text-slate-500">Default Group Settings</span>}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Default View (Market, Add Product, etc) - EXACT RESTORATION
                  return (
                    <div className="space-y-8">
                      <div>
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                            {selectedProduct.title}
                          </h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded border border-blue-500/20 uppercase tracking-widest">
                            {selectedProduct.category}
                          </span>
                          {selectedProduct.sub_category && (
                            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[9px] font-black rounded border border-purple-500/20 uppercase tracking-widest">
                              {selectedProduct.sub_category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex-1">
                          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">Price Details</p>
                          <div className="flex items-center gap-3">
                            {selectedProduct.promo_price ? (
                              <>
                                <div className="flex flex-row items-baseline gap-3">
                                  <span className="text-[10px] font-bold text-slate-500 line-through opacity-60">R {(selectedProduct.price * quantity).toFixed(2)}</span>
                                  <span className="text-2xl font-black text-white tracking-tighter">R {(selectedProduct.promo_price * quantity).toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[8px] font-black rounded-full border border-green-500/20 w-fit">
                                    {Math.round((1 - selectedProduct.promo_price / selectedProduct.price) * 100)}% OFF
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="text-2xl font-black text-white tracking-tighter">R {(selectedProduct.price * quantity).toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 bg-white/[0.05] p-1.5 rounded-2xl border border-white/5 shadow-inner">
                          <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95">
                            <IonIcon name="remove-outline" />
                          </button>
                          <div className="w-10 text-center"><span className="text-lg font-black text-white">{quantity}</span></div>
                          <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95">
                            <IonIcon name="add-outline" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-8">
                        {(() => {
                          const allMainImages = [selectedProduct.image_url, ...productVariants.map((v: any) => v.url || v.image_url)].filter(Boolean);
                          const uniqueDetailImages = Array.from(new Set(allMainImages));
                          const variantChoices: any[] = [];
                          const seenVariants = new Set();
                          productVariants.forEach((v: any, idx: number) => {
                            const key = `${v.color || "None"}-${v.image_url || v.url || ""}`;
                            if (!seenVariants.has(key)) {
                              seenVariants.add(key);
                              variantChoices.push({ ...v, color: v.color || "None", originalIndex: idx });
                            }
                          });
                          if (variantChoices.length === 0) variantChoices.push({ color: "None", image_url: selectedProduct.image_url, originalIndex: null });
                          const currentVariant = selectedVariantIndex !== null ? productVariants[selectedVariantIndex] : null;
                          const activeColor = currentVariant?.color || "None";

                          return (
                            <div className="space-y-6">
                              {variantChoices.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-3">Available Variants</h4>
                                  <div className="flex flex-wrap gap-4 bg-white/[0.01] p-5 rounded-[1.5rem] border border-white/5">
                                    {variantChoices.map((variant, idx) => {
                                      const isSelected =
                                        variant.originalIndex === null
                                          ? selectedVariantIndex === null
                                          : selectedVariantIndex ===
                                            variant.originalIndex;

                                      const img =
                                        variant.image_url ||
                                        variant.url ||
                                        selectedProduct.image_url;
                                      const processedImg =
                                        img &&
                                        (img.includes("uploads") ||
                                          img.includes("\\"))
                                          ? `/uploads/${img.split(/[\\/]/).pop()}`
                                          : img;

                                      return (
                                        <div
                                          key={idx}
                                          onClick={() => {
                                            setSelectedVariantIndex(
                                              variant.originalIndex,
                                            );
                                            setSelectedSize(null);
                                            const imgIndex =
                                              uniqueDetailImages.indexOf(img);
                                            if (imgIndex !== -1)
                                              setActivePreviewIndex(imgIndex);
                                          }}
                                          className={`group flex flex-col items-center gap-3 cursor-pointer transition-all ${isSelected ? "scale-105" : "opacity-60 hover:opacity-100"}`}
                                        >
                                          <div
                                            className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden border-2 shadow-xl transition-all ${isSelected ? "border-blue-500 shadow-blue-500/20" : "border-white/10"}`}
                                          >
                                            {processedImg && (
                                              <Image
                                                src={processedImg}
                                                alt={variant.color}
                                                width={64}
                                                height={64}
                                                className="w-full h-full object-cover"
                                              />
                                            )}
                                          </div>
                                          <div className="flex flex-col items-center gap-1.5">
                                            {variant.color !== "None" && (
                                              <div
                                                className="w-4 h-4 rounded-full border border-white/20 shadow-lg"
                                                style={{
                                                  backgroundColor:
                                                    COLORS.find(
                                                      (c) =>
                                                        c.name ===
                                                        variant.color,
                                                    )?.hex || "#333",
                                                }}
                                              />
                                            )}
                                            <span
                                              className={`text-[7px] font-black uppercase tracking-widest transition-colors ${isSelected ? "text-blue-400" : "text-white/30"}`}
                                            >
                                              {variant.color === "None"
                                                ? "Standard"
                                                : variant.color}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-8">
                                <div className="flex items-center justify-between bg-white/[0.01] p-5 rounded-[1.5rem] border border-white/5 relative">
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Select Size</h4>
                                  <div className="relative">
                                    <button onClick={() => setIsSizeDropdownOpen(!isSizeDropdownOpen)} className={`flex items-center gap-3 px-5 py-2.5 rounded-xl border-2 transition-all ${selectedSize ? "bg-blue-600/10 border-blue-500/30 text-blue-400" : "bg-white/5 border-white/10 text-white/40"}`}>
                                      <span className="text-[10px] font-black uppercase">{selectedSize || "Choose Size"}</span>
                                      <IonIcon name={isSizeDropdownOpen ? "chevron-up" : "chevron-down"} />
                                    </button>
                                    {isSizeDropdownOpen && (
                                      <div className="absolute right-0 bottom-full mb-3 w-48 bg-[#111] border border-white/10 rounded-2xl shadow-2xl z-[100] p-2">
                                        {Array.from(new Set(productVariants.flatMap((pv: any) => pv.selections?.map((s: any) => s.value) || [pv.size || pv.selection]))).filter(Boolean).map((size: any, idx) => (
                                          <button key={idx} onClick={() => { setSelectedSize(size); setIsSizeDropdownOpen(false); }} className="w-full px-4 py-3 rounded-xl text-[10px] font-black uppercase text-left hover:bg-white/5">{size}</button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-10 pt-10 border-t border-white/5 space-y-4">
                                  <div className="flex justify-between items-center group">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Select Size</span>
                                    <span className="text-xs font-black text-white">{selectedSize || "-"}</span>
                                  </div>
                                  <div className="flex justify-between items-center group">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Color</span>
                                    <span className="text-xs font-black text-blue-400 uppercase">{activeColor}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-5 bg-white/[0.03] rounded-[2rem] border border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Delivery Countries</h4>
                            <div className="flex flex-wrap gap-2">
                              {shippingInfo?.rates?.map((r: any, idx: number) => (
                                <div key={idx} className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/10"><span className="text-[10px] font-black text-white uppercase">{r.country}</span></div>
                              )) || <span className="text-[10px] italic text-slate-500">Global Delivery</span>}
                            </div>
                          </div>
                          <div className="p-5 bg-white/[0.03] rounded-[2rem] border border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Warranty</h4>
                            <p className="text-[8px] font-black uppercase text-blue-400">{warrantyInfo?.warranty || "No Warranty"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer Actions */}
              <div className="p-4 md:p-8 border-t border-white/5 bg-white/[0.02] flex items-center gap-3">
                {activeTab === "market" ? (
                  <button
                    onClick={() => handleBuyItem(selectedProduct.id)}
                    className="flex-1 py-3 md:py-4 bg-white text-black rounded-xl md:rounded-2xl font-black text-[10px] md:text-[12px] uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95"
                  >
                    <IonIcon name="bag-handle" className="text-lg md:text-xl" />
                    Buy Now
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShareProduct(selectedProduct);
                      setShowShareModal(true);
                    }}
                    className="flex-1 py-3 md:py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-[12px] uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                  >
                    <IonIcon
                      name="share-social"
                      className="text-lg md:text-xl"
                    />
                    Share
                  </button>
                )}

                {activeTab !== "market" &&
                  currentUser?.id === selectedProduct.user_id && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          handleEditProduct(selectedProduct);
                          setSelectedProduct(null);
                          setSelectedVariantIndex(null);
                          setSelectedSize(null);
                        }}
                        className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center justify-center transition-all"
                      >
                        <IonIcon
                          name="create-outline"
                          className="text-lg md:text-xl"
                        />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(selectedProduct.id)}
                        className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 flex items-center justify-center transition-all"
                      >
                        <IonIcon
                          name="trash-outline"
                          className="text-lg md:text-xl"
                        />
                      </button>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={shareProduct?.title || "Check out this product"}
        url={
          shareProduct
            ? `${typeof window !== "undefined" ? window.location.origin : ""}/dashboard/shop?id=${shareProduct.id}`
            : ""
        }
        description={shareProduct?.description}
        product={shareProduct}
      />

      {/* Interaction Bottom Sheet */}
      <InteractionBottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => {
          setIsBottomSheetOpen(false);
          setInteractionProduct(null);
        }}
        type={bottomSheetType}
        product={interactionProduct}
        data={bottomSheetData}
        onAddComment={handleSendComment}
        currentUser={currentUser}
        isLoading={isBottomSheetLoading}
        onTabChange={(newType) => {
          if (interactionProduct) {
            openBottomSheet(newType, interactionProduct);
          }
        }}
        onAction={(action) => {
          const targetProd = interactionProduct || selectedProduct;
          if (!targetProd) return;

          if (action === "star") handleToggleLike(targetProd.id);
          if (
            action === "upload" ||
            action === "forward" ||
            action === "share"
          ) {
            setShareProduct(targetProd);
            setShowShareModal(true);
          }
          if (action === "trash" && confirm("Delete this listing?")) {
            handleDeleteProduct(targetProd.id);
            setIsBottomSheetOpen(false);
            setInteractionProduct(null);
          }
        }}
      />

      {/* Report Modal */}
      {reportingProduct && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setReportingProduct(null)}
        >
          <div
            className="bg-[#111111] border border-white/10 rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-lg">
                  Report Listing
                </h3>
                <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-[0.2em] mt-0.5">
                  Community Safety
                </p>
              </div>
              <button
                onClick={() => setReportingProduct(null)}
                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <IonIcon name="close" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                <p className="text-[10px] text-white/30 font-bold uppercase mb-2">
                  Reporting Product
                </p>
                <p className="text-sm text-white font-bold truncate">
                  {reportingProduct.title}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] text-white/40 font-bold px-1">
                  Why are you reporting this?
                </p>
                {[
                  "Prohibited Item",
                  "Suspicious Activity",
                  "Wrong Category",
                  "Other",
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => handleReportSubmit(reportingProduct.id)}
                    className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-left text-xs font-bold text-white transition-all active:scale-[0.98]"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-black/40 text-center border-t border-white/5">
              <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">
                Googer Marketplace Safety Team
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
