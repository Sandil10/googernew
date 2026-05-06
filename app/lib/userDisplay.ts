export const getItemUser = (item: any) => item?.user || {};

export const getItemUsername = (item: any, fallback = "User") =>
  getItemUser(item)?.username || item?.username || item?.owner_username || fallback;

export const getItemProfilePicture = (item: any) =>
  getItemUser(item)?.profile_picture || item?.profile_picture || item?.profileImage || "";

export const getItemUserId = (item: any) =>
  getItemUser(item)?.id || item?.user_id || item?.owner_user_id || item?.userId || null;
