export type TopbarNotification = {
    id?: string;
    type?: "success" | "error" | "info" | "warning" | "custom" | "promo_code" | string;
    title: string;
    message: string;
    timestamp?: string;
    promoCode?: string;
    theme_color?: string;
    themeColor?: string;
    background_color?: string;
    backgroundColor?: string;
    color?: string;
    theme_font_color?: string;
    themeFontColor?: string;
    font_color?: string;
    fontColor?: string;
    theme_font_size?: "small" | "normal" | "large" | string;
    themeFontSize?: "small" | "normal" | "large" | string;
    font_size?: "small" | "normal" | "large" | string;
    fontSize?: "small" | "normal" | "large" | string;
};

export const addTopbarNotification = (notification: TopbarNotification) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("add-notification", {
        detail: {
            id: notification.id || `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: notification.type || "info",
            timestamp: notification.timestamp || new Date().toISOString(),
            ...notification,
        },
    }));
};
