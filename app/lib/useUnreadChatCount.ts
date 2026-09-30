"use client";

import { useEffect, useState } from "react";
import { chatService } from "@/services/chatService";
import { authService } from "@/services/authService";

export function useUnreadChatCount() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!authService.isAuthenticated()) {
            setCount(0);
            return;
        }

        let disposed = false;
        let running = false;
        const refresh = async () => {
            if (running || document.visibilityState === "hidden") return;
            running = true;
            try {
                const conversations = await chatService.getConversations();
                if (!disposed) {
                    setCount((Array.isArray(conversations) ? conversations : []).reduce(
                        (total: number, entry: any) => total + Number(entry?.unread_count || 0),
                        0,
                    ));
                }
            } catch {
                // Keep the last known badge through a temporary network failure.
            } finally {
                running = false;
            }
        };

        void refresh();
        const interval = window.setInterval(refresh, 5000);
        window.addEventListener("focus", refresh);
        window.addEventListener("chat:unread-refresh", refresh);
        return () => {
            disposed = true;
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
            window.removeEventListener("chat:unread-refresh", refresh);
        };
    }, []);

    return count;
}
