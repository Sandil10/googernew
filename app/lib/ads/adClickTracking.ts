"use client";

import { marketService } from "@/services/marketService";
import { useAdStore } from "@/app/lib/ads/adStore";

export type AdClickActionType = "message" | "visit" | "call";

export const getAdClickId = (target: any) => {
  const raw = target?.raw || target || {};
  return (
    target?.adId ||
    target?.ad_id ||
    raw.adId ||
    raw.ad_id ||
    target?.id ||
    raw.id
  );
};

export const logSponsoredAdClick = (target: any, actionType: AdClickActionType = "visit") => {
  const clickId = getAdClickId(target);
  if (!clickId) return;

  void marketService.logAdClick(clickId, actionType).then((result: any) => {
    if (!result?.success) return;
    useAdStore.getState().updateAdState(target?.raw || target, {
      clicks: Number(result.clicks || result.link_actions || 0),
      link_actions: Number(result.link_actions || result.clicks || 0),
      message_clicks: Number(result.message_clicks || 0),
      visit_clicks: Number(result.visit_clicks || 0),
      call_clicks: Number(result.call_clicks || 0),
      current_reach: Number(result.current_reach ?? result.reach ?? 0),
      reach: Number(result.current_reach ?? result.reach ?? 0),
    });
  });
};
