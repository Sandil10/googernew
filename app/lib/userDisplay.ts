export const getItemUser = (item: any) => item?.user || {};

export const getUserType = (user: any) =>
  String(
    user?.user_type ??
    user?.userType ??
    user?.owner_user_type ??
    user?.ownerUserType ??
    ""
  ).toLowerCase();

export const getUserDisplayName = (user: any, fallback = "User") => {
  if (!user) return fallback;
  const userType = getUserType(user).replace(/[\s-]+/g, "_");
  if (userType === "superadmin" || userType === "super_admin") {
    return user.username || user.user_name || user.name || user.full_name || user.fullName || fallback;
  }
  if (userType === "admin") {
    return user.username || user.user_name || user.name || user.full_name || user.fullName || fallback;
  }
  return user.full_name || user.fullName || user.username || user.name || fallback;
};

export const getItemUsername = (item: any, fallback = "User") =>
  getUserDisplayName(
    {
      ...item,
      ...getItemUser(item),
      username: getItemUser(item)?.username || item?.username || item?.owner_username,
    },
    fallback
  );

export const getItemProfilePicture = (item: any) =>
  getItemUser(item)?.profile_picture || item?.profile_picture || item?.profileImage || "";

export const getItemUserId = (item: any) =>
  getItemUser(item)?.id || item?.user_id || item?.owner_user_id || item?.userId || null;

export const formatGoogerId = (value: any) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "N/A";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return `id - ${digits.padStart(6, "0").slice(-6)}`;
};
