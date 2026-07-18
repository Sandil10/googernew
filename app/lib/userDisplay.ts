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
      ...getItemUser(item),
      ...item,
      username:
        item?.owner_username ||
        item?.ownerUsername ||
        item?.username ||
        getItemUser(item)?.username ||
        getItemUser(item)?.name,
    },
    fallback
  );

export const getItemProfilePicture = (item: any) =>
  item?.profile_picture ||
  item?.profilePicture ||
  item?.owner_profile_picture ||
  item?.ownerProfilePicture ||
  item?.profileImage ||
  getItemUser(item)?.profile_picture ||
  getItemUser(item)?.profilePicture ||
  "";

export const getItemUserId = (item: any) =>
  item?.user_id ||
  item?.userId ||
  item?.owner_user_id ||
  item?.ownerUserId ||
  getItemUser(item)?.id ||
  getItemUser(item)?.user_id ||
  null;

export const formatGoogerId = (value: any) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "N/A";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.padStart(6, "0").slice(-6);
};
