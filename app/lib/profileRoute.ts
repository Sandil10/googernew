export const getPublicProfileHref = (
    username?: string | null,
    fallbackUserId?: string | number | null,
) => {
    const normalizedUsername = String(username || "").trim().replace(/^@+/, "");
    if (normalizedUsername) {
        return `/@${encodeURIComponent(normalizedUsername)}`;
    }

    const normalizedUserId = String(fallbackUserId ?? "").trim();
    return normalizedUserId ? `/dashboard/profile?id=${encodeURIComponent(normalizedUserId)}` : "/dashboard/profile";
};

export const getPublicChatHref = (
    username?: string | null,
    fallbackUserId?: string | number | null,
) => {
    const normalizedUsername = String(username || "").trim().replace(/^@+/, "");
    if (normalizedUsername) {
        return `/chats/${encodeURIComponent(normalizedUsername)}`;
    }

    const normalizedUserId = String(fallbackUserId ?? "").trim();
    return normalizedUserId ? `/chats?user=${encodeURIComponent(normalizedUserId)}` : "/chats";
};
