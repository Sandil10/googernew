(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,80446,e=>{"use strict";var t=e.i(11107);let r=()=>window.sessionStorage.getItem("token")||window.localStorage.getItem("token"),a="googer-viewer-key",o={user_reward_amount:1,googer_commission_amount:.25,advertiser_charge_amount:1.25,required_watch_seconds:5},n=o,i=0,s=new Map,c=new Map,l=(e,t=3e4)=>{s.set(e,Date.now()+t)},d=(e,t,r)=>{let a=Error(t?.message?t.message+(t?.error?`: ${t.error}`:""):r);return a.status=e.status,a.unauthorized=401===e.status,a.locked=!!t?.locked,a.liked=t?.liked,a.data=t,a},u=()=>{let e=r();return{"Content-Type":"application/json",Authorization:e?`Bearer ${e}`:"","x-googer-viewer-key":(()=>{if("u"<typeof localStorage)return"";let e=localStorage.getItem(a);return e||(e="u">typeof crypto&&"function"==typeof crypto.randomUUID?crypto.randomUUID():`viewer-${Date.now()}-${Math.random().toString(36).slice(2,12)}`,localStorage.setItem(a,e)),e})()}};e.s(["marketService",0,{getProducts:async(e={})=>{try{let r=new URLSearchParams(e).toString(),a=await fetch(`${t.API_URL}/market/products?${r}`,{method:"GET",cache:"no-store",headers:u()}),o=await a.json();if(!a.ok)throw Error(o.message+(o.error?`: ${o.error}`:"")||"Failed to fetch products");return{data:o.data||[],pagination:o.pagination||{limit:Number(e.limit||20),offset:Number(e.offset||0),nextOffset:0,hasMore:!1}}}catch(e){throw console.error("Error fetching market products:",e),e}},getItems:async(e={})=>{try{let r=new URLSearchParams(e).toString(),a=await fetch(`${t.API_URL}/market?${r}`,{method:"GET",cache:"no-store",headers:u()}),o=await a.json();if(!a.ok)throw Error(o.message+(o.error?`: ${o.error}`:"")||"Failed to fetch items");return o.data}catch(e){throw console.error("Error fetching market items:",e),e}},createItem:async e=>{try{let r=e instanceof FormData,a=u();r&&delete a["Content-Type"];let o=await fetch(`${t.API_URL}/market/create`,{method:"POST",headers:a,body:r?e:JSON.stringify(e)}),n=await o.json();if(!o.ok)throw Error(n.message+(n.error?`: ${n.error}`:"")||"Failed to create item");return n.data}catch(e){throw console.error("Error creating market item:",e),e}},getItemById:async e=>{let r=String(e??""),a=r.trim().replace(/^(ad|item|product|market|promo)-/i,"");if(!a||!/^\d+$/.test(a)){let e=Error(`Invalid market item id: ${r}`);throw console.error("Error fetching market item:",e),e}try{let e=await fetch(`${t.API_URL}/market/${a}`,{method:"GET",headers:u()}),r=null;try{r=await e.json()}catch{}if(!e.ok){let t=r?.message||r?.data?.message||r?.error||`Failed to fetch item (HTTP ${e.status})`,o=Error(t);throw o.status=e.status,console.warn("Error fetching market item:",{numericId:a,status:e.status,data:r}),o}return r?.data}catch(e){throw console.warn("Error fetching market item:",e),e}},getAdPublic:async e=>{try{let r=await fetch(`${t.API_URL}/market/public/${e}`,{method:"GET",cache:"no-store"}),a=await r.json();if(!r.ok)return null;return a.ad}catch{return null}},getItemByCode:async e=>{try{let r=await fetch(`${t.API_URL}/market/code/${encodeURIComponent(e)}`,{method:"GET",headers:u()}),a=await r.json();if(!r.ok)throw Error(a.message||"Failed to fetch item by code");return a.data}catch(e){throw console.error("Error fetching market item by code:",e),e}},getProductByCodePublic:async e=>{try{let r=await fetch(`${t.API_URL}/market/product/public/${encodeURIComponent(e)}`,{method:"GET",cache:"no-store"}),a=await r.json();if(!r.ok)return null;return a.product}catch{return null}},getUnifiedShareItem:async e=>{try{let r=await fetch(`${t.API_URL}/market/share-unified/${encodeURIComponent(e)}`,{method:"GET",cache:"no-store"}),a=await r.json();if(!r.ok)return null;return a}catch{return null}},updateItem:async(e,r)=>{let a=String(e).replace(/^ad-/,"");try{let e=r instanceof FormData,o=u();e&&delete o["Content-Type"];let n=await fetch(`${t.API_URL}/market/${a}`,{method:"PUT",headers:o,body:e?r:JSON.stringify(r)}),i=await n.json();if(!n.ok)throw Error(i.message||"Failed to update item");return i.data}catch(e){throw console.error("Error updating market item:",e),e}},deleteItem:async e=>{let r=String(e).replace(/^ad-/,"");try{let e=await fetch(`${t.API_URL}/market/${r}`,{method:"DELETE",headers:u()}),a=await e.json();if(!e.ok)throw Error(a.message||"Failed to delete item");return!0}catch(e){throw console.error("Error deleting market item:",e),e}},updateStatus:async(e,r)=>{let a=String(e).replace(/^ad-/,"");try{let e=await fetch(`${t.API_URL}/market/${a}/status`,{method:"PUT",headers:u(),body:JSON.stringify({status:r})}),o=await e.json();if(!e.ok)throw Error(o.message||"Failed to update status");return o}catch(e){throw console.error("Error updating market item status:",e),e}},toggleLike:async e=>{let r=String(e),a=c.get(r);if(a)return a;let o=(async()=>{try{let e=await fetch(`${t.API_URL}/market/${r}/like`,{method:"POST",headers:u()}),a=await e.json();if(!e.ok)throw d(e,a,"Failed to like item");return a.liked}catch(e){throw e?.locked||console.error("Error liking market item:",e),e}finally{c.delete(r)}})();return c.set(r,o),o},collectAdCoin:async e=>{let r="object"==typeof e&&null!==e?{ad_id:String(e.ad_id??e.adId??e.id??"").trim(),ad_type:String(e.ad_type??e.campaign_type??e.type??"Ads").trim()||"Ads"}:{ad_id:String(e).trim(),ad_type:"Ads"};try{let e=await fetch(`${t.API_URL}/market/collect-coin`,{method:"POST",headers:u(),body:JSON.stringify(r)}),a=await e.json();if(!e.ok)throw d(e,a,"Failed to collect ad coin");return a}catch(e){throw console.error("Error collecting ad coin:",e),e}},markAdVideoWatchEligible:async(e,r=5)=>{let a=String(e);try{let e=await fetch(`${t.API_URL}/market/${a}/video-watch-eligible`,{method:"POST",headers:u(),body:JSON.stringify({watchedSeconds:r})}),o=await e.json();if(!e.ok)throw Error(o.message||"Failed to confirm ad video watch");return o}catch(e){throw console.error("Error confirming ad video watch:",e),e}},getAdCoinSettingsPublic:async()=>{if(Date.now()<i)return n||o;try{let e=await fetch(`${t.API_URL}/admin/customization/ad-coin-settings/public`,{method:"GET",cache:"no-store"}),r=await e.json().catch(()=>({}));if(!e.ok)return i=Date.now()+3e4,n||o;return n=r.settings||o,i=0,n}catch{return i=Date.now()+3e4,n||o}},addComment:async(e,r,a)=>{let o=String(e);try{let e=await fetch(`${t.API_URL}/market/${o}/comments`,{method:"POST",headers:u(),body:JSON.stringify({text:r,parent_id:a})}),n=await e.json();if(!e.ok)throw Error(n.message||"Failed to add comment");return n.data}catch(e){throw console.error("Error adding comment:",e),e}},deleteComment:async e=>{try{let r=await fetch(`${t.API_URL}/market/comments/${e}`,{method:"DELETE",headers:u()}),a=await r.json();if(!r.ok)throw Error(a.message||"Failed to delete comment");return a}catch(e){throw console.error("Error deleting comment:",e),e}},likeComment:async e=>{try{let r=await fetch(`${t.API_URL}/market/comments/${e}/like`,{method:"POST",headers:u()});return await r.json()}catch(e){throw console.error("Error liking comment:",e),e}},dislikeComment:async e=>{try{let r=await fetch(`${t.API_URL}/market/comments/${e}/dislike`,{method:"POST",headers:u()});return await r.json()}catch(e){throw console.error("Error disliking comment:",e),e}},reportComment:async e=>{try{let r=await fetch(`${t.API_URL}/market/comments/${e}/report`,{method:"POST",headers:u()});return await r.json()}catch(e){throw console.error("Error reporting comment:",e),e}},getComments:async e=>{let r=String(e);try{let e=await fetch(`${t.API_URL}/market/${r}/comments`,{method:"GET",headers:u()}),a=await e.json();if(!e.ok)throw Error(a.message||"Failed to fetch comments");return a.data}catch(e){throw console.error("Error fetching comments:",e),e}},logShare:async e=>{let r=String(e);try{let e=await fetch(`${t.API_URL}/market/${r}/share`,{method:"POST",headers:u()});return await e.json()}catch(e){console.error("Error logging share:",e)}},logView:async e=>{let r=String(e),a=`market-view:${r}`;if(Date.now()<(s.get(a)||0))return{success:!1,skipped:!0};try{let e=await fetch(`${t.API_URL}/market/${r}/view`,{method:"POST",headers:u()}),o=await e.json().catch(()=>({}));if(!e.ok)return l(a),{success:!1,skipped:!0,status:e.status,...o};return o}catch{return l(a),{success:!1,skipped:!0}}},logAdImpression:async e=>{let r=String(e);try{let e=await fetch(`${t.API_URL}/market/${r}/impression`,{method:"POST",headers:u()});return await e.json()}catch(e){console.error("Error logging ad impression:",e)}},logAdClick:async(e,r)=>{let a=String(e);try{let e=await fetch(`${t.API_URL}/market/${a}/click`,{method:"POST",headers:u(),body:JSON.stringify(r?{action_type:r}:{})});return await e.json()}catch(e){console.error("Error logging ad click:",e)}},getLikes:async e=>{let r=String(e);try{let e=await fetch(`${t.API_URL}/market/${r}/likes`,{method:"GET",headers:u()});return(await e.json()).data||[]}catch(e){return console.error(e),[]}},getShares:async e=>{let r=String(e);try{let e=await fetch(`${t.API_URL}/market/${r}/shares`,{method:"GET",headers:u()});return(await e.json()).data||[]}catch(e){return console.error(e),[]}},getViews:async e=>{let r=String(e);try{let e=await fetch(`${t.API_URL}/market/${r}/views`,{method:"GET",headers:u()});return(await e.json()).data||[]}catch(e){return console.error(e),[]}},hasAuthToken:()=>!!r()}])},88130,e=>{"use strict";var t=e.i(11107);let r=()=>{let e=(()=>{try{return sessionStorage.getItem("token")||localStorage.getItem("token")}catch{return null}})();return{"Content-Type":"application/json",...e?{Authorization:`Bearer ${e}`}:{}}};e.s(["subscriptionService",0,{getMySubscription:async()=>{let e=await fetch(`${t.API_URL}/subscriptions/me`,{headers:r()});return e.ok&&(await e.json()).subscription||null},subscribe:async(e,a)=>{let o;try{o=await fetch(`${t.API_URL}/subscriptions/subscribe`,{method:"POST",headers:r(),body:JSON.stringify({plan_id:e,switch_plan:a?.switchPlan===!0})})}catch(e){return{error:`Network error: ${e.message||"could not reach server"}`}}let n=null;try{n=await o.json()}catch{}return o.ok?(window.dispatchEvent(new Event("subscription:changed")),{subscription:n.subscription}):{error:n?.message||(404===o.status?"API route not found — backend may need restart":`Server returned ${o.status}`),code:o.status}},cancelMySubscription:async()=>{let e=await fetch(`${t.API_URL}/subscriptions/cancel`,{method:"POST",headers:r()});return e.ok&&window.dispatchEvent(new Event("subscription:changed")),e.ok},setAutoRenew:async e=>{let a=await fetch(`${t.API_URL}/subscriptions/auto-renew`,{method:"PATCH",headers:r(),body:JSON.stringify({auto_renew:e})});return a.ok&&(await a.json()).subscription||null},getPublicPlans:async()=>{let e=await fetch(`${t.API_URL}/admin/customization/subscription-plans/public`);if(!e.ok)throw Error("Failed to load plans");return(await e.json()).plans||[]},getAllPlans:async()=>{let e=await fetch(`${t.API_URL}/admin/customization/subscription-plans`,{headers:r()});if(!e.ok)throw Error("Failed to load plans");return(await e.json()).plans||[]},createPlan:async e=>{let a=await fetch(`${t.API_URL}/admin/customization/subscription-plans`,{method:"POST",headers:r(),body:JSON.stringify(e)}),o=await a.json();if(!a.ok)throw Error(o.message||"Failed to create plan");return o.plan},updatePlan:async(e,a)=>{let o=await fetch(`${t.API_URL}/admin/customization/subscription-plans/${e}`,{method:"PUT",headers:r(),body:JSON.stringify(a)}),n=await o.json();if(!o.ok)throw Error(n.message||"Failed to update plan");return n.plan},getMyUsage:async()=>{try{let e=await fetch(`${t.API_URL}/subscriptions/my-usage`,{headers:r()});if(!e.ok)return null;return(await e.json()).usage||null}catch{return null}},getMyFeatures:async()=>{try{let e=await fetch(`${t.API_URL}/subscriptions/features`,{headers:r()});if(!e.ok)return null;return(await e.json()).features||null}catch{return null}},getMyPlan:async()=>{try{let e=await fetch(`${t.API_URL}/subscription-plans/my`,{headers:r()});if(!e.ok)return null;let a=await e.json();if(!a.data)return null;return{...a.data,is_basic:!!a.is_basic}}catch{return null}},getBadgeForUser:async e=>{try{let r=await fetch(`${t.API_URL}/subscriptions/badge/${e}`);if(!r.ok)return null;return(await r.json()).badge||null}catch{return null}},deletePlan:async e=>{let a=await fetch(`${t.API_URL}/admin/customization/subscription-plans/${e}`,{method:"DELETE",headers:r()});if(!a.ok)throw Error((await a.json().catch(()=>({}))).message||"Failed to delete plan")}}])},46228,e=>{"use strict";var t=e.i(11107);let r=async e=>{let t=e.headers.get("content-type");return t&&t.includes("application/json")?await e.json():null},a=()=>{let e=(e=>{try{return sessionStorage.getItem(e)||localStorage.getItem(e)}catch{return null}})("token");return{Authorization:`Bearer ${e}`,"Content-Type":"application/json"}};e.s(["walletService",0,{searchUsers:async(e,o)=>{let n=new URLSearchParams({query:e});o?.includeSelf&&n.set("includeSelf","true");let i=await fetch(`${t.API_URL}/wallet/search-users?${n.toString()}`,{headers:a()}),s=await r(i);if(!i.ok)throw Error(s?.message||"Search failed");return s.users},requestMoney:async(e,o,n,i=0,s="request",c)=>{let l=await fetch(`${t.API_URL}/wallet/request`,{method:"POST",headers:a(),body:JSON.stringify({receiverId:e,amount:o,note:n,commissionPercentage:i,type:s,...c})}),d=await r(l);if(!l.ok)throw Error(d?.message||"Request failed");return d},verifyManualPaymentHold:async e=>{let o=await fetch(`${t.API_URL}/wallet/verify-manual-payment-hold`,{method:"POST",headers:a(),body:JSON.stringify(e)}),n=await r(o);if(!o.ok)throw Error(n?.message||"Manual payment hold transaction not found");return n},getPendingRequests:async()=>{let e=await fetch(`${t.API_URL}/wallet/pending-requests`,{headers:a()}),o=await r(e);if(!e.ok)throw Error(o?.message||"Failed to fetch requests");return o.requests},respondToRequest:async(e,o)=>{let n=await fetch(`${t.API_URL}/wallet/respond`,{method:"POST",headers:a(),body:JSON.stringify({requestId:e,action:o})}),i=await r(n);if(!n.ok)throw Error(i?.message||"Response failed");return i},directTransfer:async(e,o,n,i=0)=>{let s=await fetch(`${t.API_URL}/wallet/transfer`,{method:"POST",headers:a(),body:JSON.stringify({receiverId:e,amount:o,note:n,commissionPercentage:i})}),c=await r(s);if(!s.ok)throw Error(c?.message||"Transfer failed");return c},getTransactionHistory:async()=>{let e=await fetch(`${t.API_URL}/wallet/history`,{headers:a()}),o=await r(e);if(!e.ok)throw Error(o?.message||"Failed to fetch history");return Array.isArray(o?.transactions)?o.transactions:[]},cancelTransaction:async e=>{let o=await fetch(`${t.API_URL}/wallet/cancel`,{method:"POST",headers:a(),body:JSON.stringify({transactionId:e})}),n=await r(o);if(!o.ok)throw Error(n?.message||"Cancellation failed");return n},payOrder:async(e,o)=>{let n=JSON.stringify({amount:e,...o}),i=await fetch(`${t.API_URL}/wallet/pay-order`,{method:"POST",headers:a(),body:n});429===i.status&&(await new Promise(e=>setTimeout(e,1500)),i=await fetch(`${t.API_URL}/wallet/pay-order`,{method:"POST",headers:a(),body:n}));let s=await r(i);if(!i.ok){let e="";try{e=(await i.text()).trim()}catch{}throw Error(s?.message||e||`Payment failed (HTTP ${i.status})`)}return s},recordPromoAd:async(e,o,n)=>{let i=await fetch(`${t.API_URL}/wallet/record-promo-ad`,{method:"POST",headers:a(),body:JSON.stringify({adId:e,campaignType:o,note:n})}),s=await r(i);if(!i.ok)throw Error(s?.message||"Failed to record promo ad");return s},refundAdBudgetEdit:async(e,o)=>{let n=await fetch(`${t.API_URL}/wallet/refund-ad-budget-edit`,{method:"POST",headers:{...a(),...o.idempotencyKey?{"Idempotency-Key":o.idempotencyKey}:{}},body:JSON.stringify({adId:o.adId,amount:e,note:o.note})}),i=await r(n);if(!n.ok)throw Error(i?.message||`Ad refund failed (HTTP ${n.status})`);return i},payProfilePromote:async(e,o)=>{let n=JSON.stringify({amount:e,...o}),i=await fetch(`${t.API_URL}/wallet/pay-profile-promote`,{method:"POST",headers:a(),body:n});429===i.status&&(await new Promise(e=>setTimeout(e,1500)),i=await fetch(`${t.API_URL}/wallet/pay-profile-promote`,{method:"POST",headers:a(),body:n}));let s=await r(i);if(!i.ok)throw Error(s?.message||`Payment failed (HTTP ${i.status})`);return s},addAdminCapital:async(e,o)=>{let n=await fetch(`${t.API_URL}/wallet/admin/add-capital`,{method:"POST",headers:a(),body:JSON.stringify({amount:e,note:o})}),i=await r(n);if(!n.ok)throw Error(i?.message||`Add capital failed (HTTP ${n.status})`);return i}}])},63188,e=>{"use strict";let t="googer-ad-wallet-adjustments-v1";function r(e){let t=e?.id??e?._id??e?.user_id;if(null!=t&&String(t).trim())return`id:${String(t).trim()}`;let r="string"==typeof e?.username?e.username.trim().toLowerCase():"";if(r)return`username:${r}`;let a="string"==typeof e?.email?e.email.trim().toLowerCase():"";return a?`email:${a}`:""}function a(){return r(function(){try{let e=window.sessionStorage.getItem("user")||window.localStorage.getItem("user");return e?JSON.parse(e):null}catch{return null}}())}function o(){try{window.localStorage.removeItem(t)}catch{}return[]}function n(e,r,a,o){try{window.localStorage.removeItem(t)}catch{}return null}function i(e,t){return e}e.s(["addAdWalletRefund",()=>n,"getCurrentUserIdentityKey",()=>a,"getUserIdentityKey",()=>r,"getWalletBalanceWithAdAdjustments",()=>i,"readAdWalletAdjustments",()=>o])},58569,e=>{"use strict";var t=e.i(71645),r=e.i(88130);let a={plan_slug:"basic",is_basic:!0,verified_tick:!1,badge_color:null,write_goog_limit:null,write_goog_color_limit:null,goog_letter_limit:null,product_upload_limit:null,video_ads_save_limit:null,photo_ads_save_limit:null,save_goog_limit:null,ads_expiry_days:null,free_profile_ad_promo:!1,chat_text_colors:!1,chat_stickers:!1,text_messaging:!0,voice_calls:!0,video_calls:!1,voice_to_text:!1,text_to_voice:!1,video_call_quality:"sd",chat_auto_delete_days:null,chat_auto_delete_value:null,chat_auto_delete_unit:null,extra:{}},o=null,n=null,i=new Set;window.addEventListener("subscription:changed",()=>{o=null});let s=async()=>{if(n)return await n||a;n=r.subscriptionService.getMyFeatures();try{let e=await n||a;return o=e,i.forEach(t=>t(e)),e}finally{n=null}};function c(){let[e,r]=(0,t.useState)(o||a);return(0,t.useEffect)(()=>{i.add(r),s();let e=()=>{s()};return window.addEventListener("subscription:changed",e),()=>{i.delete(r),window.removeEventListener("subscription:changed",e)}},[]),e}e.s(["clearFeaturesCache",0,()=>{o=null},"refreshSubscriptionFeatures",0,s,"useSubscriptionFeatures",()=>c])},7136,e=>{"use strict";var t=e.i(11107);let r=()=>{let e=window.sessionStorage.getItem("token")||window.localStorage.getItem("token");return{"Content-Type":"application/json",Authorization:e?`Bearer ${e}`:""}};e.s(["orderService",0,{getBadgeCounts:async()=>{try{let e=await fetch(`${t.API_URL}/orders/badge-counts`,{method:"GET",headers:r(),cache:"no-store"}),a=await e.json();if(!e.ok)throw Error(a.message||"Failed to fetch order badge counts");return a.data}catch(e){throw console.error("Error fetching order badge counts:",e),e}},createOrder:async e=>{try{let a=await fetch(`${t.API_URL}/orders/create`,{method:"POST",headers:r(),body:JSON.stringify(e)}),o=await a.json();if(!a.ok)throw Error(o.message||"Failed to create order");return o.data}catch(e){throw console.error("Error creating order:",e),e}},getBuyerOrders:async(e={})=>{try{let a=new URLSearchParams(e).toString(),o=await fetch(`${t.API_URL}/orders/buyer?${a}`,{method:"GET",headers:r(),cache:"no-store"}),n=await o.json();if(!o.ok)throw Error(n.message||"Failed to fetch orders");return n.data}catch(e){throw console.error("Error fetching buyer orders:",e),e}},getSellerOrders:async(e={})=>{try{let a=new URLSearchParams(e).toString(),o=await fetch(`${t.API_URL}/orders/seller?${a}`,{method:"GET",headers:r(),cache:"no-store"}),n=await o.json();if(!o.ok)throw Error(n.message||"Failed to fetch orders");return n.data}catch(e){throw console.error("Error fetching seller orders:",e),e}},updateStatus:async(e,a)=>{try{let o=await fetch(`${t.API_URL}/orders/${e}/status`,{method:"PUT",headers:r(),body:JSON.stringify({status:a})}),n=await o.json();if(!o.ok)throw Error(n.message||"Failed to update order status");return n.data}catch(e){throw console.error("Error updating status:",e),e}},createBulkOrder:async e=>{try{let a=await fetch(`${t.API_URL}/orders/create-bulk`,{method:"POST",headers:r(),body:JSON.stringify(e)}),o=await a.json();if(!a.ok)throw Error(o.message||"Failed to create bulk order");return o.data}catch(e){throw console.error("Error creating bulk order:",e),e}},cancelOrderGroup:async e=>{try{let a=await fetch(`${t.API_URL}/orders/group/${e}/cancel`,{method:"POST",headers:r()}),o=await a.json();if(!a.ok)throw Error(o.message||"Failed to cancel order group");return o.data}catch(e){throw console.error("Error cancelling order group:",e),e}},updateOrderGroupStatus:async(e,a)=>{try{let o=await fetch(`${t.API_URL}/orders/group/${e}/status`,{method:"PUT",headers:r(),body:JSON.stringify({status:a})}),n=await o.json();if(!o.ok)throw Error(n.message||"Failed to update order group status");return n.data}catch(e){throw console.error("Error updating order group status:",e),e}},submitReport:async(e,a)=>{try{let o=await fetch(`${t.API_URL}/orders/${e}/report`,{method:"POST",headers:r(),body:JSON.stringify(a)}),n=await o.json();if(!o.ok)throw Error(n.message||"Failed to submit report");return n.success}catch(e){throw console.error("Error submitting report:",e),e}}}])},97922,e=>{"use strict";var t=e.i(471),r=e.i(11107);let a=async e=>{let t=e.headers.get("content-type");return t&&t.includes("application/json")?await e.json():null},o=(e=!1)=>{let r,a={"Content-Type":"application/json"};return e&&Object.assign(a,(r=t.authService.getToken?.())?{Authorization:`Bearer ${r}`}:{}),a};e.s(["categoryService",0,{getTree:async(e=!1)=>{let t=Date.now(),n=await fetch(`${r.API_URL}/categories/tree?includeInactive=${e?"1":"0"}&t=${t}`,{method:"GET",headers:o(!1),cache:"no-store"}),i=await a(n);if(!n.ok)throw Error(i?.message||"Failed to load categories");return i?.categories||[]},getAdminTree:async()=>{let e=Date.now(),t=await fetch(`${r.API_URL}/categories/admin/tree?t=${e}`,{method:"GET",headers:o(!0),cache:"no-store"}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to load admin categories");return n?.categories||[]},getGlobalCategoryCommission:async()=>{let e=Date.now(),t=await fetch(`${r.API_URL}/categories/commission/global?t=${e}`,{method:"GET",headers:o(!1),cache:"no-store"}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to load global category commission");return Number(n?.commissionPercentage??n?.setting_value??0)},getManualCategoryCommissionEnabled:async()=>{let e=Date.now(),t=await fetch(`${r.API_URL}/categories/commission/manual-enabled?t=${e}`,{method:"GET",headers:o(!1),cache:"no-store"}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to load manual category commission setting");return!!(n?.enabled??n?.setting_value)},setGlobalCategoryCommission:async e=>{let t=await fetch(`${r.API_URL}/categories/commission/global`,{method:"PUT",headers:o(!0),body:JSON.stringify({commissionPercentage:e})}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to save global category commission");return n},setManualCategoryCommissionEnabled:async e=>{let t=await fetch(`${r.API_URL}/categories/commission/manual-enabled`,{method:"PUT",headers:o(!0),body:JSON.stringify({enabled:e})}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to save manual category commission setting");return n},createCategory:async e=>{let t=await fetch(`${r.API_URL}/categories`,{method:"POST",headers:o(!0),body:JSON.stringify(e)}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to create category");return n},updateCategory:async(e,t)=>{let n=await fetch(`${r.API_URL}/categories/${encodeURIComponent(String(e))}`,{method:"PUT",headers:o(!0),body:JSON.stringify(t)}),i=await a(n);if(!n.ok)throw Error(i?.message||"Failed to update category");return i},deleteCategory:async e=>{let t=await fetch(`${r.API_URL}/categories/${encodeURIComponent(String(e))}`,{method:"DELETE",headers:o(!0)}),n=await a(t);if(!t.ok)throw Error(n?.message||"Failed to delete category");return n}},"notifyCategoryTreeChanged",0,()=>{let e=`${Date.now()}-${Math.random().toString(36).slice(2)}`;try{window.dispatchEvent(new CustomEvent("googer-categories-updated",{detail:{token:e}}))}catch{}try{window.localStorage.setItem("googer-categories-sync",e)}catch{}}])},93652,e=>{"use strict";var t=e.i(43476),r=e.i(71645),a=e.i(18566),o=e.i(48317);let n=`Welcome to Googer, a vibrant social media platform that offers video and photo sharing, along with an online store. This Privacy Policy outlines our commitment to protecting your privacy and governs the use of your personal information on the Googer platform.

By accessing and using Googer, you consent to the practices described in this policy.

Information Collection

Personal Account Information:

When you create an account on Googer, we collect certain personal information such as your username, email address, and password. This information helps us tailor your experience and provide secure access to the platform.

User-Generated Content:

Googer enables you to share videos, photos, and other content. Such user-generated content may be visible to other users as per your privacy settings.

Usage Insights:

We gather data about your interactions with Googer, including the content you view, engage with, or interact on, to enhance your experience and improve our services.

Automatically Collected Information:

We automatically collect usage information, including the devices you use, your IP address, browser type, and operating system. This information assists us in troubleshooting and improving the platform.

Chat Information:

Messages: When you use Googer Chat and messaging features, we may collect and process information such as message content, attachments, sender and recipient details, conversation identifiers, timestamps, delivery and read status, and chat activity metadata (including calls, blocked or reported actions). We also collect device and connection information to deliver, secure, and improve our services. Messages you send are accessible to the intended recipients, and we are not responsible for how they use or share that information.

How We Use Your Information

Enhanced Services:

We utilize the collected information to provide you with a seamless experience on Googer, including personalized content recommendations, communication tools, and access to the online store.

Communication Channels:

Your email address may be used to send you notifications, updates, newsletters, and promotional content related to Googer's features and services.

Social Engagement:

Interactions such as comments, likes, and messages that you engage in with other users may be visible to the respective users and governed by your chosen privacy settings.

Analytical Insights:

We analyze user behavior and feedback to continually improve Googer's features, usability, and overall user satisfaction.

Pricing and Financial Information

When you engage with transactions involving rupieer coin or participate in the purchase of products through our online store, we may collect and process pricing and financial information. This includes details about rupieer coin values, prices of products, payment methods used, billing details, and other relevant transactional data. Please note that the security and privacy of your financial information are of utmost importance to us. We implement encryption and secure protocols to safeguard this sensitive data.

Your financial information, including transactional details, may be used to process payments, facilitate purchases, manage refunds or returns, and ensure a seamless shopping experience within the Googer platform. We may also use this information for accounting, auditing, and compliance purposes.

Rest assured that we handle your pricing and financial information with the highest level of confidentiality and take appropriate measures to prevent unauthorized access or disclosure.

By using the Googer platform for transactions and purchases, you consent to the collection, processing, and storage of your pricing and financial information as described in this Privacy Policy.

Sharing and Disclosure

Public Content Exposure:

Any content you share publicly on Googer, including videos, photos, and comments, may be accessible to other users and the general public.

Trusted Third-Party Partners:

We may share your information with trusted third-party service providers who assist us in delivering and enhancing the platform's functionality.

Legal Obligations:

We may disclose your information if required by law, regulation, legal process, or governmental request.

Business Changes:

In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction.

Your Privacy Choices

Privacy Settings:

You can control who sees your content by adjusting your privacy settings on Googer.

Communication Preferences:

You can manage your communication preferences and opt-out of specific types of notifications.

Security Measures

While we implement security measures to protect your information, no method of data transmission is entirely foolproof.

Children's Privacy

Googer is not intended for users under the age of 13. We do not knowingly collect personal information from individuals in this age group.

Changes to This Policy

We may update this Privacy Policy to reflect changes in our practices. We will notify you of any significant changes through appropriate channels.

Contact Us

For inquiries about this Privacy Policy or your privacy on Googer, please use our Help Support page:

https://googer.site/help-support`,i=`Terms & Conditions:

Welcome to googer, a platform designed to connect individuals, share experiences, and promote communication, as well as facilitate business transactions. Please carefully review and familiarize yourself with the following terms and conditions, as they outline the rules and guidelines for using our social media platform, video and photo sharing features, and online store services.

General Agreement:
By using googer's services, whether as an individual or a representative of a business entity, you agree to abide by the terms set forth in this document. Your usage implies your acceptance of these terms and conditions.

Intellectual Property Rights:
We respect the intellectual property rights of others, and we ask the same from you. By using our services, you agree not to infringe upon any intellectual property rights. We reserve the right to block access or terminate accounts of users who violate copyrights or other intellectual property rights.

Content:

1. Account & Eligibility

* Users must provide accurate information
* Minimum age requirement (e.g. 18+ recommended)
* One user = one account only
* Account security is user responsibility

2. Content Ownership & License

* Platform gets license to:
     * display
     * distribute
     * process payments
 * Creators must own or have rights to sell content
 * No copyrighted or stolen content allowed
 * Platform not responsible for user-generated content

3. Pricing & Payments

* Creators set their own prices (within allowed range)
* Platform will deduct service fee (e.g. 10%-20%)
* Payments processed via approved payment methods
* Payouts may take X days (e.g. 3-7 working days)

4. Refund Policy

* Digital content = generally non-refundable
* Refund only if:
    * Content not delivered
    * Technical issues
    * Fraud detected

5. Prohibited Content

Not allowed:

* Copyrighted material
* Adult/illegal content
* Violence or harmful content
* Spam or misleading content
* Fake or scam listings

6. Content Upload Rules

* Must match description and preview
* No misleading titles or thumbnails
* Correct category must be selected
* File must be virus-free and safe

7. Platform Rights

* Platform can remove any content without notice if violated
* Platform can suspend accounts
* Platform can change fees and policies

8. Subscription & Access

* Subscription grants temporary access only
* Access ends when subscription expires
* No sharing of subscription accounts allowed

9. Transactions & Fees

* Platform fee will be automatically deducted
* Taxes (if applicable) may apply
* Creator receives net earnings after deductions

10. Liability

* Platform is not responsible for user disputes
* Platform does not guarantee creator earnings
* Users transact at their own risk

11. Affiliate / Share Commission

* Users may earn commission by sharing content using referral links
* Creators can set commission percentage for shared sales
* Platform tracks all referrals and sales accurately
* Commission is only paid for valid completed transactions
* Fraud, fake traffic, or self-referrals are strictly prohibited
* Platform reserves the right to withhold or cancel commission in case of abuse

Business Use:
If you are representing a business or an organization, you acknowledge that you have the authority to act on behalf of that entity. Your business's usage must align with the applicable laws and regulations.

User Conduct:
Your interactions within the platform should be respectful and lawful. Engaging in harmful, harassing, or fraudulent behavior is strictly prohibited.

Privacy and Data Usage:
Your privacy is important to us. By using googer, you consent to the collection and usage of your data as outlined in our Privacy Policy.

Account Security:
You are responsible for maintaining the confidentiality of your account details. Notify us immediately if you suspect any unauthorized access to your account.

Modification and Termination:
We reserve the right to modify or terminate our services at any time, for any reason, without notice. You may also terminate your account at your discretion.

Legal Compliance:
Using googer's services means adhering to all applicable laws and regulations. Any violations may lead to account termination and legal actions.

Limitation of Liability:
We are not liable for any direct, indirect, or consequential damages arising from your use of googer's services.

Governing Law:
These terms and conditions are governed by the laws of the jurisdiction where googer is incorporated.

Entire Agreement:
This Agreement constitutes the entire understanding between you and googer, superseding any prior agreements or understandings.

Please read this Agreement thoroughly. If you do not comprehend it or disagree with any part, please refrain from using the Service.

By accepting this Agreement, you assert that you are at least 18 years old and fully capable of entering into and adhering to its terms.`;function s({activeTab:e}){let s=(0,a.useRouter)(),c=(0,r.useMemo)(()=>"privacy"===e?"Privacy Policy":"Terms & Conditions",[e]);return(0,t.jsx)("div",{className:"mx-auto max-w-5xl pb-10 text-white",children:(0,t.jsxs)("section",{className:"overflow-hidden rounded-[2.2rem] border border-white/8 bg-[#1d1d1f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]",children:[(0,t.jsx)("div",{className:"h-2 w-full bg-gradient-to-r from-transparent via-[#f03131] to-transparent"}),(0,t.jsx)("div",{className:"px-5 py-5 sm:px-7 sm:py-6",children:(0,t.jsxs)("div",{className:"flex items-start justify-between gap-4",children:[(0,t.jsxs)("div",{className:"max-w-2xl",children:[(0,t.jsx)("p",{className:"text-[11px] font-black uppercase tracking-[0.45em] text-white/35",children:"Googer Legal"}),(0,t.jsx)("h1",{className:"mt-3 text-[1.35rem] font-black tracking-tight text-white sm:text-[1.55rem]",children:c}),(0,t.jsxs)("p",{className:"mt-2 text-[11px] leading-6 text-white/60 sm:text-[12px]",children:["Please read the Googer ",c," carefully before using the platform."]}),(0,t.jsx)("span",{className:"mt-4 inline-flex rounded-full border border-white/10 bg-[#171719] px-3 py-2 text-[9px] font-black uppercase tracking-[0.28em] text-white/55",children:"privacy"===e?"Privacy":"Terms"})]}),(0,t.jsxs)("button",{type:"button",onClick:()=>s.back(),className:"inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-bold text-white transition hover:bg-white/[0.07]",children:[(0,t.jsx)(o.default,{name:"arrow-back-outline",className:"text-sm"}),"Back"]})]})}),(0,t.jsxs)("div",{className:"border-t border-white/8 bg-[#18181a] px-5 py-6 sm:px-7 sm:py-7",children:[(0,t.jsx)("article",{className:"rounded-[1.35rem] border border-white/8 bg-[#1f1f22] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5",children:(0,t.jsx)("div",{className:"mt-4 space-y-4",children:(0,t.jsx)("pre",{className:"max-w-3xl whitespace-pre-wrap break-words font-sans text-[11px] leading-6 text-white/66 sm:text-[12px]",children:"privacy"===e?n:i})})}),(0,t.jsxs)("div",{className:"mt-4 rounded-[1rem] border border-white/8 bg-[#1a1a1d] px-4 py-3 text-[11px] leading-5 text-white/60",children:["Need legal or privacy help? Open"," ",(0,t.jsx)("button",{type:"button",onClick:()=>s.push("/help-support"),className:"font-bold text-white underline underline-offset-4",children:"Help & Support"}),"."]})]})]})})}e.s(["default",()=>s])},43127,e=>{"use strict";var t=e.i(43476),r=e.i(82391),a=e.i(93652);function o(){return(0,t.jsx)(r.default,{children:(0,t.jsx)(a.default,{activeTab:"terms"})})}e.s(["default",()=>o])}]);