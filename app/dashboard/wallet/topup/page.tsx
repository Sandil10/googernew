"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import IonIcon from '@/app/components/IonIcon';
import OrderChatPopup from '@/app/components/wallet/OrderChatPopup';
import { authService } from '@/services/authService';

type Step = 'select' | 'buy' | 'topup';

const getApiUrl = () => {
    const isClient = typeof window !== 'undefined';
    if (!isClient) return '/api';
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    return '/api';
};
const API_URL = getApiUrl();
const PAYREXX_BASE = 'https://raw.githubusercontent.com/payrexx/payment-logos/main/assets/card-icons';
const CLEARBIT_BASE = 'https://logo.clearbit.com';
const ASSIGN_KEY = 'googer_topup_assignments';

// ─── Types ────────────────────────────────────────────────────────────────────
type FieldDef = {
    key: string; label: string; type: 'text' | 'email' | 'number';
    required?: boolean; placeholder?: string; defaultValue?: string; locked?: boolean;
};
type AdminMethod = { id: number; name: string; icon: string; fields: FieldDef[] };
type CatalogEntry = { id: string; name: string; svgFile?: string; clearbitDomain?: string };
type TopupAssignment = number | { methodId: number; fields?: Record<string, string> };
type SavedPayment = {
    id: string;
    catalogId: string;
    name: string;
    category: string;
    svgFile?: string;
    clearbitDomain?: string;
    adminFields: { key: string; label: string; value: string; locked?: boolean }[];
    email: string;
    lkrRate: string;
    cryptoCurrency?: 'USD' | 'USDT' | 'LKR';
    minAmount: string;
    maxAmount: string;
    availableAmount?: string;
    releaseValue: string;
    releaseUnit: 'h' | 'min' | 's';
    description?: string;
    savedAt: string;
    userId?: number;
    username?: string;
    profilePicture?: string;
    adStatus?: 'active' | 'locked' | 'inactive';
    isOwn?: boolean;
};
type TransactionFilter = 'all' | 'pending' | 'completed' | 'cancelled';
type P2PTransaction = {
    id: number | string;
    ad_id: number | string;
    buyer_id: number | string;
    seller_id: number | string;
    amount: string | number;
    receive_amount?: string | null;
    tx_id?: string | null;
    screenshot_data?: string | null;
    screenshot_name?: string | null;
    status: 'pending' | 'completed' | 'cancelled' | string;
    created_at?: string;
    completed_at?: string | null;
    ad_name?: string;
    buyer_username?: string;
    seller_username?: string;
    reservesBalance?: boolean;
    buyer_report_reason?: string | null;
    buyer_reported_at?: string | null;
    seller_report_reason?: string | null;
    seller_reported_at?: string | null;
};

const BUYER_REPORT_REASONS  = ['Payment still pending', 'Payment Not Received', 'Seller Not Responding', 'Other'];
const SELLER_REPORT_REASONS = ['User Not Responding', 'Payment still pending', 'Payment Not Received', 'Fake Receipt Uploaded', 'Buyer Marked as Paid Without Paying', 'Other'];
const DEFAULT_BUY_POPUP_DESCRIPTION = [
    '1. Enter the amount you want to buy.',
    '2. Click Make Payment.',
    '3. Enter the Transaction ID or upload the payment slip.',
    '4. Click Submit to confirm your payment.',
].join('\n');

function getSavedAssignmentFields(methodId?: number): Record<string, string> {
    if (!methodId || typeof window === 'undefined') return {};
    try {
        const assignments = JSON.parse(localStorage.getItem(ASSIGN_KEY) || '{}') as Record<string, TopupAssignment>;
        const match = Object.values(assignments).find(assignment =>
            typeof assignment === 'number' ? assignment === methodId : assignment?.methodId === methodId
        );
        return typeof match === 'number' ? {} : (match?.fields || {});
    } catch {
        return {};
    }
}

function GuideNote({ guide, description }: { guide: string; description?: string }) {
    const customDescription = description?.trim();
    return (
        <div className="bg-[#0a0a0a] border border-gray-800/50 rounded-xl px-4 py-3 space-y-2">
            {customDescription && (
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Description</p>
                    <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">{customDescription}</p>
                </div>
            )}
            <div className={customDescription ? 'border-t border-gray-800/60 pt-2' : ''}>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Guide Note</p>
                <p className="text-[10px] text-gray-400 leading-relaxed whitespace-pre-line">{guide}</p>
            </div>
        </div>
    );
}

// ─── Full 42-method catalog ───────────────────────────────────────────────────
const PAYMENT_CATALOG: Record<string, CatalogEntry[]> = {
    Wallet: [
        { id: 'paypal',      name: 'PayPal',      svgFile: 'card_paypal.svg',        clearbitDomain: 'paypal.com' },
        { id: 'skrill',      name: 'Skrill',      svgFile: 'card_skrill_sofort.svg', clearbitDomain: 'skrill.com' },
        { id: 'neteller',    name: 'Neteller',    svgFile: 'card_neteller.svg',      clearbitDomain: 'neteller.com' },
        { id: 'payoneer',    name: 'Payoneer',    svgFile: undefined,                clearbitDomain: 'payoneer.com' },
        { id: 'wise',        name: 'Wise',        svgFile: undefined,                clearbitDomain: 'wise.com' },
        { id: 'amazon_pay',  name: 'Amazon Pay',  svgFile: 'card_amazon_pay.svg',    clearbitDomain: 'pay.amazon.com' },
        { id: 'paysafecard', name: 'PaySafeCard', svgFile: 'card_paysafecard.svg',   clearbitDomain: 'paysafecard.com' },
        { id: 'qiwi',        name: 'QIWI',        svgFile: 'card_qiwi.svg',          clearbitDomain: 'qiwi.com' },
    ],
    Bank: [
        { id: 'bank_transfer', name: 'Bank Transfer',     svgFile: 'card_bank-transfer.svg',     clearbitDomain: 'swift.com' },
        { id: 'sepa',          name: 'SEPA Direct Debit', svgFile: 'card_sepa-direct-debit.svg', clearbitDomain: undefined },
        { id: 'direct_debit',  name: 'Direct Debit',      svgFile: 'card_direct_debit.svg',      clearbitDomain: undefined },
        { id: 'trustly',       name: 'Trustly',           svgFile: 'card_trustly.svg',           clearbitDomain: 'trustly.com' },
    ],
    Crypto: [
        { id: 'binance',      name: 'Binance',      svgFile: undefined,            clearbitDomain: 'binance.com' },
        { id: 'bitcoin',      name: 'Bitcoin',      svgFile: 'card_bitcoin.svg',   clearbitDomain: 'bitcoin.org' },
        { id: 'ethereum',     name: 'Ethereum',     svgFile: 'card_ethereum.svg',  clearbitDomain: 'ethereum.org' },
        { id: 'usdt',         name: 'USDT',         svgFile: undefined,            clearbitDomain: 'tether.to' },
        { id: 'litecoin',     name: 'Litecoin',     svgFile: 'card_litecoin.svg',  clearbitDomain: 'litecoin.org' },
        { id: 'ripple',       name: 'Ripple (XRP)', svgFile: 'card_ripple.svg',    clearbitDomain: 'ripple.com' },
        { id: 'coinbase',     name: 'Coinbase',     svgFile: 'card_coinbase.svg',  clearbitDomain: 'coinbase.com' },
        { id: 'trust_wallet', name: 'Trust Wallet', svgFile: undefined,            clearbitDomain: 'trustwallet.com' },
        { id: 'gocrypto',     name: 'GoCrypto',     svgFile: 'card_go-crypto.svg', clearbitDomain: undefined },
    ],
    Card: [
        { id: 'visa',       name: 'Visa',        svgFile: 'card_visa.svg',             clearbitDomain: 'visa.com' },
        { id: 'mastercard', name: 'Mastercard',  svgFile: 'card_mastercard.svg',       clearbitDomain: 'mastercard.com' },
        { id: 'amex',       name: 'Amex',        svgFile: 'card_american-express.svg', clearbitDomain: 'americanexpress.com' },
        { id: 'maestro',    name: 'Maestro',     svgFile: 'card_maestro.svg',          clearbitDomain: undefined },
        { id: 'discover',   name: 'Discover',    svgFile: 'card_discover.svg',         clearbitDomain: 'discover.com' },
        { id: 'jcb',        name: 'JCB',         svgFile: 'card_jcb.svg',              clearbitDomain: 'jcb.co.jp' },
        { id: 'diners',     name: 'Diners Club', svgFile: 'card_diners-club.svg',      clearbitDomain: 'dinersclub.com' },
        { id: 'unionpay',   name: 'UnionPay',    svgFile: 'card_unionpay.svg',         clearbitDomain: 'unionpayintl.com' },
    ],
    Digital: [
        { id: 'google_pay',  name: 'Google Pay',  svgFile: 'card_google-pay.svg',  clearbitDomain: 'pay.google.com' },
        { id: 'apple_pay',   name: 'Apple Pay',   svgFile: 'card_apple-pay.svg',   clearbitDomain: 'apple.com' },
        { id: 'samsung_pay', name: 'Samsung Pay', svgFile: 'card_samsung-pay.svg', clearbitDomain: 'samsung.com' },
        { id: 'wechat_pay',  name: 'WeChat Pay',  svgFile: 'card_wechat-pay.svg',  clearbitDomain: 'weixin.qq.com' },
        { id: 'alipay',      name: 'Alipay',      svgFile: 'card_alipay.svg',      clearbitDomain: 'alipay.com' },
    ],
    Gateway: [
        { id: 'stripe',    name: 'Stripe',    svgFile: 'card_stripe.svg',    clearbitDomain: 'stripe.com' },
        { id: 'klarna',    name: 'Klarna',    svgFile: 'card_klarna.svg',    clearbitDomain: 'klarna.com' },
        { id: 'braintree', name: 'Braintree', svgFile: 'card_braintree.svg', clearbitDomain: 'braintreepayments.com' },
    ],
    Local: [
        { id: 'ideal',      name: 'iDEAL',      svgFile: 'card_ideal.svg',      clearbitDomain: 'ideal.nl' },
        { id: 'bancontact', name: 'Bancontact', svgFile: 'card_bancontact.svg', clearbitDomain: undefined },
        { id: 'giropay',    name: 'Giropay',    svgFile: 'card_giropay.svg',    clearbitDomain: undefined },
        { id: 'sofort',     name: 'Sofort',     svgFile: 'card_sofort.svg',     clearbitDomain: 'sofort.com' },
        { id: 'eps',        name: 'EPS',        svgFile: 'card_eps.svg',        clearbitDomain: undefined },
        { id: 'p24',        name: 'Przelewy24', svgFile: 'card_przelewy24.svg', clearbitDomain: 'przelewy24.pl' },
        { id: 'twint',      name: 'TWINT',      svgFile: 'card_twint.svg',      clearbitDomain: 'twint.ch' },
        { id: 'belfius',    name: 'Belfius',    svgFile: 'card_belfius.svg',    clearbitDomain: 'belfius.be' },
    ],
    Other: [
        { id: 'western_union', name: 'Western Union', svgFile: 'card_western_union.svg', clearbitDomain: 'westernunion.com' },
        { id: 'custom',        name: 'Custom',         svgFile: undefined,               clearbitDomain: undefined },
    ],
};

const CATEGORIES = Object.keys(PAYMENT_CATALOG);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LETTER_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];
function letterColor(name: string) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
    return LETTER_COLORS[h % LETTER_COLORS.length];
}

// ─── PaymentLogo ──────────────────────────────────────────────────────────────
function PaymentLogo({ name, svgFile, clearbitDomain }: { name: string; svgFile?: string; clearbitDomain?: string }) {
    const [step, setStep] = useState(0);
    const adv = () => setStep(s => s + 1);
    if (step === 0 && svgFile)
        return <img src={`${PAYREXX_BASE}/${svgFile}`} alt={name} onError={adv} className="object-contain w-full h-full" />;
    if ((step === 0 || step === 1) && clearbitDomain)
        return <img src={`${CLEARBIT_BASE}/${clearbitDomain}`} alt={name} onError={adv} className="object-contain w-full h-full rounded-md" />;
    return (
        <div className="w-full h-full rounded-xl flex items-center justify-center text-white font-black text-base"
            style={{ backgroundColor: letterColor(name) }}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

const getToken = () => typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null;
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});
// Resolve a proof image path — backend stores relative paths like /uploads/… for local
// and full https:// URLs for Cloudinary. Prefix the backend base when it's a relative path.
const resolveProofUrl = (p?: string | null): string => {
    if (!p) return '';
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
    // Derive backend base from API_URL (strip trailing /api)
    const base = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${base}${path}`;
};
const authFetch = (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers, cache: init.cache ?? 'no-store' });
};
const getOrderId = (tx: P2PTransaction) => {
    const raw = `${tx.id}-${tx.ad_id}-${tx.buyer_id}-${tx.seller_id}-${tx.created_at || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
    return String(hash >>> 0).padStart(10, '0').slice(-10);
};
const copyText = (text: string) => {
    if (typeof navigator !== 'undefined') navigator.clipboard?.writeText(text).catch(() => {});
};
const getReleaseDurationMs = (payment: SavedPayment) => {
    const value = Number(payment.releaseValue);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (payment.releaseUnit === 's') return value * 1000;
    if (payment.releaseUnit === 'min') return value * 60 * 1000;
    return value * 60 * 60 * 1000;
};
const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
};
const getReleaseCountdown = (tx: P2PTransaction, payment: SavedPayment, nowMs: number) => {
    const durationMs = getReleaseDurationMs(payment);
    const startedMs = new Date(tx.created_at || '').getTime();
    if (!durationMs || !Number.isFinite(startedMs)) return null;
    return formatCountdown(startedMs + durationMs - nowMs);
};

// ─── BuyScreen ────────────────────────────────────────────────────────────────
function BuyScreen({ onBack, walletBalance: initialWalletBalance, onGoRequest, onGoTopup, onGoSell }: { onBack: () => void; walletBalance: number; onGoRequest: () => void; onGoTopup: () => void; onGoSell: () => void }) {
    const [walletBalance, setWalletBalance]   = useState<number>(initialWalletBalance);
    const [payments, setPayments]             = useState<SavedPayment[]>([]);
    const [loadingAds, setLoadingAds]         = useState(true);
    const [currentUserId, setCurrentUserId]   = useState<number | null>(null);
    const [adminMethods, setAdminMethods]     = useState<AdminMethod[]>([]);
    const [loadingAdmin, setLoadingAdmin]     = useState(true);
    const [hasApproval, setHasApproval]       = useState<boolean | null>(null);
    const [showNoApproval, setShowNoApproval] = useState(false);
    const [deleteTarget, setDeleteTarget]     = useState<string | null>(null);
    const [deleteError, setDeleteError]       = useState<string | null>(null);
    const [deleting, setDeleting]             = useState(false);
    const [currencyFilter, setCurrencyFilter] = useState<'all' | 'LKR' | 'USD' | 'USDT'>('all');
    const [countryFilter, setCountryFilter]   = useState<string>('');
    const [showCountryFilterMenu, setShowCountryFilterMenu] = useState(false);
    const [countryFilterSearch, setCountryFilterSearch]     = useState('');
    const [saving, setSaving]                 = useState(false);
    const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all');
    const [transactions, setTransactions] = useState<P2PTransaction[]>([]);
    const [localTransactionsByAdId, setLocalTransactionsByAdId] = useState<Record<string, P2PTransaction>>({});
    const [confirmTransaction, setConfirmTransaction] = useState<{ tx: P2PTransaction; payment: SavedPayment } | null>(null);
    const [confirmingTransaction, setConfirmingTransaction] = useState(false);

    // Buy popup (for other users viewing an ad)
    const [buyPopupAd, setBuyPopupAd]       = useState<SavedPayment | null>(null);
    const [buyStep, setBuyStep]             = useState<'amount' | 'details'>('amount');
    const [buyAmount, setBuyAmount]         = useState('');
    const [buyScreenshot, setBuyScreenshot] = useState<File | null>(null);
    const [buyTxId, setBuyTxId]             = useState('');
    const [buyError, setBuyError]           = useState<string | null>(null);
    const [buySuccess, setBuySuccess]       = useState(false);
    const [pendingDetailsTx, setPendingDetailsTx] = useState<P2PTransaction | null>(null);

    // Buyer's pending detail/proof popup
    const [buyerViewPopup, setBuyerViewPopup] = useState<{ tx: P2PTransaction; payment: SavedPayment } | null>(null);
    // Completed transaction view popup (buyer & seller)
    const [completedViewPopup, setCompletedViewPopup] = useState<{ tx: P2PTransaction; payment: SavedPayment } | null>(null);
    const [buyBlockedPopup, setBuyBlockedPopup] = useState(false);
    const [buyBlockedTx, setBuyBlockedTx]       = useState<P2PTransaction | null>(null);
    const [cancellingBlockedTx, setCancellingBlockedTx] = useState(false);
    const [viewTxId, setViewTxId]             = useState('');
    const [viewScreenshot, setViewScreenshot] = useState<File | null>(null);
    const [viewSubmitting, setViewSubmitting] = useState(false);
    const [viewError, setViewError]           = useState<string | null>(null);
    const [reportTarget, setReportTarget] = useState<{ tx: P2PTransaction; payment: SavedPayment } | null>(null);
    const [reportReason, setReportReason] = useState(BUYER_REPORT_REASONS[0]);
    const [reportCustomReason, setReportCustomReason] = useState('');
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);

    const pendingBuyLockRef = useRef<Promise<unknown> | null>(null);
    const activeBuyLockAdIdRef = useRef<string | null>(null);
    const transactionFilterRef = useRef<TransactionFilter>('all');
    const buyLockHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const buyScreenshotRef = useRef<File | null>(null);
    const viewScreenshotRef = useRef<File | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (transactionFilter !== 'pending') return;
        setNowMs(Date.now());
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, [transactionFilter]);

    const setAdLockStatus = (adId: string, locked: boolean) => {
        setPayments(prev => prev.map(payment =>
            payment.id === String(adId)
                ? { ...payment, adStatus: locked ? 'locked' : (payment.adStatus === 'inactive' ? 'inactive' : 'active') }
                : payment
        ));
    };

    const getTxRole = (tx: P2PTransaction) => String(tx.buyer_id) === String(currentUserId) ? 'buyer' : 'seller';
    const getOwnReportReason = (tx: P2PTransaction) => getTxRole(tx) === 'buyer' ? tx.buyer_report_reason : tx.seller_report_reason;
    const getReportBadges = (tx: P2PTransaction) => [
        tx.buyer_report_reason ? { label: 'REPORTED BY BUYER', reason: tx.buyer_report_reason } : null,
        tx.seller_report_reason ? { label: 'REPORTED BY SELLER', reason: tx.seller_report_reason } : null,
    ].filter(Boolean) as { label: string; reason: string }[];
    const applyReportedTransaction = (tx: P2PTransaction) => {
        setTransactions(prev => prev.map(item => String(item.id) === String(tx.id) ? { ...item, ...tx } : item));
        setBuyerViewPopup(prev => prev && String(prev.tx.id) === String(tx.id) ? { ...prev, tx: { ...prev.tx, ...tx } } : prev);
        setCompletedViewPopup(prev => prev && String(prev.tx.id) === String(tx.id) ? { ...prev, tx: { ...prev.tx, ...tx } } : prev);
        setConfirmTransaction(prev => prev && String(prev.tx.id) === String(tx.id) ? { ...prev, tx: { ...prev.tx, ...tx } } : prev);
    };
    const openReportPopup = (tx: P2PTransaction, payment: SavedPayment) => {
        const role = getTxRole(tx);
        const reasons = role === 'buyer' ? BUYER_REPORT_REASONS : SELLER_REPORT_REASONS;
        setReportTarget({ tx, payment });
        setReportReason(reasons[0]);
        setReportCustomReason('');
        setReportError(null);
    };
    const submitReport = async () => {
        if (!reportTarget) return;
        const reason = reportReason === 'Other' ? reportCustomReason.trim() : reportReason;
        if (!reason) { setReportError('Report reason is required.'); return; }
        setReportSubmitting(true);
        setReportError(null);
        try {
            const res = await authFetch(`${API_URL}/p2p-ads/transactions/${reportTarget.tx.id}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) { setReportError(data.message || 'Failed to submit report.'); return; }
            applyReportedTransaction(data.transaction);
            setReportTarget(null);
        } catch {
            setReportError('Network error. Please try again.');
        } finally {
            setReportSubmitting(false);
        }
    };
    const renderReportPanel = (tx: P2PTransaction, payment: SavedPayment) => {
        const ownReport = getOwnReportReason(tx);
        const badges = getReportBadges(tx);
        return (
            <div className="space-y-2">
                {badges.map(badge => (
                    <div key={badge.label} className="bg-red-500/[0.06] border border-red-500/20 rounded-xl px-4 py-3">
                        <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">{badge.label}</p>
                        <p className="text-[10px] text-red-200 font-semibold mt-1 break-words">{badge.reason}</p>
                    </div>
                ))}
                {ownReport ? null : (
                    <button
                        type="button"
                        onClick={() => openReportPopup(tx, payment)}
                        className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95"
                    >
                        Report
                    </button>
                )}
            </div>
        );
    };

    const renderCardReportBadges = (tx: P2PTransaction) => (
        <>
            {tx.seller_report_reason && (
                <div className="bg-red-500/[0.06] border border-red-500/20 rounded-lg px-2.5 py-1.5 text-right">
                    <p className="text-[8px] font-black text-red-400 uppercase tracking-widest">Reported by Seller</p>
                    <p className="text-[9px] text-red-300 font-semibold mt-0.5 break-words leading-tight">{tx.seller_report_reason}</p>
                </div>
            )}
            {tx.buyer_report_reason && (
                <div className="bg-red-500/[0.06] border border-red-500/20 rounded-lg px-2.5 py-1.5 text-right">
                    <p className="text-[8px] font-black text-red-400 uppercase tracking-widest">Reported by Buyer</p>
                    <p className="text-[9px] text-red-300 font-semibold mt-0.5 break-words leading-tight">{tx.buyer_report_reason}</p>
                </div>
            )}
        </>
    );

    const stopBuyLockHeartbeat = () => {
        if (buyLockHeartbeatRef.current) {
            clearInterval(buyLockHeartbeatRef.current);
            buyLockHeartbeatRef.current = null;
        }
    };

    const setLocalTransactionStatus = (ad: SavedPayment, status: TransactionFilter, amount = buyAmount) => {
        if (status === 'all') return;
        setLocalTransactionsByAdId(prev => ({
            ...prev,
            [ad.id]: {
                id: `local-${ad.id}-${status}`,
                ad_id: ad.id,
                buyer_id: currentUserId || 'me',
                seller_id: ad.userId || '',
                amount: amount || '0',
                receive_amount: buyReceiveAmount,
                status,
                reservesBalance: false,
                screenshot_name: buyScreenshot?.name || null,
                created_at: new Date().toISOString(),
                ad_name: ad.name,
            },
        }));
    };

    const closeBuyPopup = () => {
        const target = buyPopupAd;
        if (target && pendingDetailsTx) {
            handleCancelPendingTransaction(pendingDetailsTx, target);
            buyScreenshotRef.current = null;
            setBuyPopupAd(null); setBuyStep('amount'); setBuyAmount(''); setBuyScreenshot(null); setBuyTxId(''); setBuyError(null); setBuySuccess(false); setPendingDetailsTx(null);
            return;
        }
        if (target) {
            const lockWasActive = activeBuyLockAdIdRef.current === target.id || !!pendingBuyLockRef.current;
            setAdLockStatus(target.id, false);
            const refresh = () => {
                fetchAds(true);
                fetchTransactions(transactionFilter);
            };
            if (!buySuccess && lockWasActive) {
                stopBuyLockHeartbeat();
                const endpoint = buyStep === 'details' ? 'cancel' : 'unlock';
                if (endpoint === 'cancel') {
                    setLocalTransactionStatus(target, 'cancelled');
                    setTransactionFilter('all');
                }
                const body = endpoint === 'cancel'
                    ? JSON.stringify({ amount: buyAmount, receive_amount: buyReceiveAmount })
                    : undefined;
                const unlockAfterLock = Promise.resolve(pendingBuyLockRef.current)
                    .catch(() => {})
                    .then(() => fetch(`${API_URL}/p2p-ads/${target.id}/${endpoint}`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${getToken()}`,
                            ...(body ? { 'Content-Type': 'application/json' } : {}),
                        },
                        body,
                    }))
                    .then(refresh)
                    .catch(refresh);
                pendingBuyLockRef.current = unlockAfterLock;
                unlockAfterLock.finally(() => {
                    if (pendingBuyLockRef.current === unlockAfterLock) pendingBuyLockRef.current = null;
                    if (activeBuyLockAdIdRef.current === target.id) activeBuyLockAdIdRef.current = null;
                });
            } else {
                refresh();
            }
        }
        buyScreenshotRef.current = null;
        setBuyPopupAd(null); setBuyStep('amount'); setBuyAmount(''); setBuyScreenshot(null); setBuyTxId(''); setBuyError(null); setBuySuccess(false); setPendingDetailsTx(null);
    };

    const openBuyPopup = (ad: SavedPayment) => {
        // Global buyer lock: if this buyer already has ANY pending transaction (on any ad)
        // that is still actually live (the ad still exists in the current ads list), block
        // opening a new buy popup for a different ad. Pending transactions whose ad has
        // been deleted are treated as orphaned and ignored, so a stuck row in the DB
        // doesn't permanently lock the buyer out.
        const liveAdIds = new Set(payments.map(p => String(p.id)));
        const myPending = transactions.find(t =>
            String(t.status).toLowerCase() === 'pending' &&
            String(t.buyer_id) === String(currentUserId) &&
            liveAdIds.has(String(t.ad_id))
        );
        if (myPending && String(myPending.ad_id) !== String(ad.id)) {
            setBuyBlockedTx(myPending);
            setBuyBlockedPopup(true);
            return;
        }
        // Per-seller lock: another buyer holds this seller's ad with an unsubmitted pending tx
        const isSellerLocked = Object.values(latestTransactionByAdId).some(
            t => String(t.status).toLowerCase() === 'pending' && !t.tx_id && String(t.seller_id) === String(ad.userId)
        );
        if (isSellerLocked) { setBuyBlockedPopup(true); return; }
        buyScreenshotRef.current = null;
        setBuyPopupAd(ad); setBuyStep('amount'); setBuyAmount(''); setBuyScreenshot(null); setBuyTxId(''); setBuyError(null); setBuySuccess(false);
        setPendingDetailsTx(null);
        activeBuyLockAdIdRef.current = null;
        pendingBuyLockRef.current = null;
        stopBuyLockHeartbeat();
    };

    // Re-run the amount validation whenever the live ad data shifts (eg the
    // seller's other transactions reduce the available balance in the background).
    useEffect(() => {
        if (!buyPopupAd || !buyAmount) return;
        setBuyError(getBuyAmountError(buyAmount, buyPopupAd));
    }, [buyPopupAd?.availableAmount, buyPopupAd?.maxAmount, buyPopupAd?.minAmount]);

    // Keep the open buy popup ad in sync with the latest server snapshot so
    // available balance reflects the seller's other in-flight transactions live.
    useEffect(() => {
        if (!buyPopupAd) return;
        const fresh = payments.find(p => p.id === buyPopupAd.id);
        if (!fresh) return;
        if (
            fresh.availableAmount !== buyPopupAd.availableAmount ||
            fresh.maxAmount !== buyPopupAd.maxAmount ||
            fresh.minAmount !== buyPopupAd.minAmount ||
            fresh.lkrRate !== buyPopupAd.lkrRate ||
            fresh.adStatus !== buyPopupAd.adStatus
        ) {
            setBuyPopupAd(fresh);
        }
    }, [payments, buyPopupAd?.id]);

    const buySellerCurrency = buyPopupAd?.cryptoCurrency || (buyPopupAd?.category === 'Crypto' ? 'USDT' : 'LKR');
    const buyReceiveAmount = buyPopupAd && buyAmount
        ? (parseFloat(buyAmount) * parseFloat(buyPopupAd.lkrRate || '1')).toFixed(2)
        : '0.00';

    const getBuyAmountError = (value: string, ad: SavedPayment | null = buyPopupAd) => {
        if (!ad || !value.trim()) return null;
        const amt = parseFloat(value);
        if (isNaN(amt) || amt <= 0) return 'Enter a valid amount.';
        const receiveRupee = amt * Math.max(parseFloat(ad.lkrRate || '1'), 0.0001);
        const minA = parseFloat(ad.minAmount);
        const maxA = parseFloat(ad.maxAmount);
        const availableA = parseFloat(ad.availableAmount || ad.maxAmount);
        const effectiveMax = Math.min(maxA, availableA);
        if (receiveRupee < minA) return `Minimum receive amount is R ${minA.toLocaleString()}.`;
        if (receiveRupee > effectiveMax) return `Available balance is R ${effectiveMax.toLocaleString()}.`;
        return null;
    };

    const handleBuyAmountChange = (value: string) => {
        setBuyAmount(value);
        setBuyError(getBuyAmountError(value));
    };

    const handleBuyNow = async () => {
        setBuyError(null);
        const amountError = getBuyAmountError(buyAmount);
        if (amountError) { setBuyError(amountError); return; }
        const ad = buyPopupAd!;
        const localTx: P2PTransaction = {
            id: `local-${ad.id}-pending`,
            ad_id: ad.id,
            buyer_id: currentUserId || 'me',
            seller_id: ad.userId || '',
            amount: buyAmount || '0',
            receive_amount: buyReceiveAmount,
            status: 'pending',
            reservesBalance: true,
            created_at: new Date().toISOString(),
            ad_name: ad.name,
        };
        setLocalTransactionsByAdId(prev => ({ ...prev, [ad.id]: localTx }));
        setAdLockStatus(ad.id, false);
        setTransactionFilter('pending');
        setBuyPopupAd(null);
        setBuyStep('amount');
        try {
            const res = await fetch(`${API_URL}/p2p-ads/${ad.id}/start`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: buyAmount, receive_amount: buyReceiveAmount }),
            });
            const data = await res.json();
            if (!res.ok) {
                setBuyError(data.message || 'Failed to start pending transaction.');
                setLocalTransactionsByAdId(prev => {
                    const next = { ...prev };
                    delete next[ad.id];
                    return next;
                });
                return;
            }
            setLocalTransactionsByAdId(prev => ({ ...prev, [ad.id]: { ...localTx, ...data.transaction, reservesBalance: true } }));
            fetchAds(true);
            fetchTransactions('pending');
        } catch {
            setLocalTransactionsByAdId(prev => {
                const next = { ...prev };
                delete next[ad.id];
                return next;
            });
            setBuyError('Network error. Please try again.');
        }
    };

    const handleBuySubmit = async () => {
        setBuyError(null);
        const selectedScreenshot = buyScreenshotRef.current || buyScreenshot;
        if (!selectedScreenshot && !buyTxId.trim()) { setBuyError('Please upload a payment screenshot or enter a Transaction ID.'); return; }
        if (!pendingDetailsTx) { setBuyError('Open this request from Pending before submitting details.'); return; }
        try {
            await Promise.resolve(pendingBuyLockRef.current).catch(() => {});
            const submitForm = new FormData();
            if (buyTxId.trim()) submitForm.append('tx_id', buyTxId.trim());
            if (selectedScreenshot) submitForm.append('screenshot', selectedScreenshot);
            const res = await fetch(`${API_URL}/p2p-ads/transactions/${pendingDetailsTx.id}/submit-details`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
                body: submitForm,
            });
            const data = await res.json();
            if (!res.ok) { setBuyError(data.message || 'Failed to submit transaction.'); return; }
            setAdLockStatus(buyPopupAd!.id, false);
            setLocalTransactionsByAdId(prev => ({
                ...prev,
                [buyPopupAd!.id]: {
                    id: data.transaction?.id || `local-${buyPopupAd!.id}-pending`,
                    ad_id: buyPopupAd!.id,
                    buyer_id: currentUserId || 'me',
                    seller_id: buyPopupAd!.userId || '',
                    amount: buyAmount || '0',
                    receive_amount: buyReceiveAmount,
                    tx_id: buyTxId.trim(),
                    screenshot_data: data.transaction?.screenshot_data || null,
                    screenshot_name: selectedScreenshot?.name || null,
                    status: 'pending',
                    reservesBalance: true,
                    created_at: new Date().toISOString(),
                    ad_name: buyPopupAd!.name,
                },
            }));
            stopBuyLockHeartbeat();
            if (activeBuyLockAdIdRef.current === buyPopupAd!.id) activeBuyLockAdIdRef.current = null;
            fetchAds(true);
            fetchTransactions(transactionFilter);
            setTransactionFilter('pending');
            setBuyPopupAd(null);
            setBuyStep('amount');
            setBuyAmount('');
            buyScreenshotRef.current = null;
            setBuyScreenshot(null);
            setBuyTxId('');
            setPendingDetailsTx(null);
            setBuySuccess(false);
        } catch {
            setBuyError('Network error. Please try again.');
        }
    };

    // Catalog modal
    const [showCatalog, setShowCatalog]         = useState(false);
    const [activeCategory, setActiveCategory]   = useState(CATEGORIES[0]);

    // Form modal
    const [formEntry, setFormEntry]               = useState<CatalogEntry | null>(null);
    const [formAdmin, setFormAdmin]               = useState<AdminMethod | null>(null);
    const [formCategory, setFormCategory]         = useState<string>('');
    const [editingId, setEditingId]               = useState<string | null>(null);
    const [adminFieldVals, setAdminFieldVals]     = useState<Record<string, string>>({});
    const [lkrRate, setLkrRate]                   = useState('330');
    const [cryptoCurrency, setCryptoCurrency]     = useState<'USD' | 'USDT' | 'LKR'>('LKR');
    const [minAmount, setMinAmount]               = useState('');
    const [maxAmount, setMaxAmount]               = useState('');
    const minErr = minAmount !== '' && (parseFloat(minAmount) > walletBalance || parseFloat(minAmount) <= 0);
    const maxErr = maxAmount !== '' && (parseFloat(maxAmount) > walletBalance || parseFloat(maxAmount) <= 0);
    const [releaseValue, setReleaseValue]         = useState('');
    const [releaseUnit, setReleaseUnit]           = useState<'h' | 'min' | 's'>('h');
    const [adDescription, setAdDescription]      = useState('');
    const [formError, setFormError]               = useState<string | null>(null);
    const [chatPopup, setChatPopup]               = useState<{ userId: string; name: string; roleLabel: string; orderLabel?: string } | null>(null);
    const isCrypto = formCategory === 'Crypto';
    const isBank = formCategory === 'Bank';

    type CountryOpt = { name: string; flag: string; flagSvg: string; cca2: string };
    const [countries, setCountries] = useState<CountryOpt[]>([]);
    const [country, setCountry] = useState<string>('');
    const [showCountryMenu, setShowCountryMenu] = useState(false);
    const [countrySearch, setCountrySearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetch('https://restcountries.com/v3.1/all?fields=name,flag,flags,cca2')
            .then(r => r.json())
            .then((data: any[]) => {
                if (cancelled || !Array.isArray(data)) return;
                const opts: CountryOpt[] = data
                    .map(c => ({
                        name: c?.name?.common || '',
                        flag: c?.flag || '',
                        flagSvg: c?.flags?.svg || c?.flags?.png || '',
                        cca2: c?.cca2 || '',
                    }))
                    .filter(c => c.name)
                    .sort((a, b) => a.name.localeCompare(b.name));
                setCountries(opts);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const selectedCountry = countries.find(c => c.name === country || `${c.flag} ${c.name}` === country);

    const mapAdRow = (row: any): SavedPayment => ({
        id: String(row.id),
        catalogId: row.catalog_id,
        name: row.name,
        category: row.category,
        svgFile: row.svg_file ?? undefined,
        clearbitDomain: row.clearbit_domain ?? undefined,
        adminFields: Array.isArray(row.admin_fields) ? row.admin_fields : JSON.parse(row.admin_fields || '[]'),
        email: '',
        lkrRate: String(row.lkr_rate),
        cryptoCurrency: row.crypto_currency ?? undefined,
        minAmount: String(row.min_amount),
        maxAmount: String(row.max_amount),
        availableAmount: String(row.available_amount ?? row.max_amount),
        releaseValue: row.release_value ?? '',
        releaseUnit: (row.release_unit as 'h' | 'min' | 's') || 'h',
        description: row.description ?? '',
        savedAt: row.created_at,
        userId: Number(row.user_id),
        username: row.username,
        profilePicture: row.profile_picture,
        adStatus: row.is_inactive ? 'inactive' : (row.is_locked ? 'locked' : 'active'),
        isOwn: row.is_own === true || row.is_own === 'true',
    });

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const fetchWalletBalance = () => {
        authFetch(`${API_URL}/auth/profile`)
            .then(r => r.json())
            .then(data => {
                const profile = data.user || data;
                const bal = parseFloat(profile?.wallet_balance ?? profile?.walletBalance ?? '0') || 0;
                if (!isNaN(bal)) setWalletBalance(bal);
            })
            .catch(() => {});
    };

    const fetchAds = (silent = false) => {
        if (!silent) setLoadingAds(true);
        authFetch(`${API_URL}/p2p-ads`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setPayments((data.ads || []).map(mapAdRow));
                    setLocalTransactionsByAdId(prev => {
                        const next = { ...prev };
                        Object.entries(next).forEach(([adId, tx]) => {
                            if (tx.status === 'pending' && tx.reservesBalance && (data.ads || []).some((row: any) => String(row.id) === adId)) {
                                next[adId] = { ...tx, reservesBalance: false };
                            }
                        });
                        return next;
                    });
                }
            })
            .catch(() => {})
            .finally(() => { if (!silent) setLoadingAds(false); });
    };

    const fetchTransactions = (_filter: TransactionFilter = transactionFilter) => {
        // Always fetch ALL transactions so the client can correctly detect
        // status changes (pending → completed/cancelled) for every ad.
        // The active tab filter is applied client-side in filteredPayments.
        authFetch(`${API_URL}/p2p-ads/transactions?status=all`)
            .then(r => r.json())
            .then(data => {
                if (data.success) setTransactions(data.transactions || []);
            })
            .catch(() => {});
    };

    useEffect(() => {
        fetchAds();
        fetchTransactions('all');
        fetchWalletBalance();
        pollRef.current = setInterval(() => {
            fetchAds(true);
            fetchTransactions(transactionFilterRef.current);
        }, 1000);
        const walletPollRef = setInterval(fetchWalletBalance, 5000);

        const token = getToken();
        if (token && typeof EventSource !== 'undefined') {
            const separator = API_URL.includes('?') ? '&' : '?';
            const eventsUrl = `${API_URL}/p2p-ads/events${separator}token=${encodeURIComponent(token)}`;
            const source = new EventSource(eventsUrl);
            eventSourceRef.current = source;
            source.addEventListener('ad-lock-change', (event) => {
                try {
                    const payload = JSON.parse((event as MessageEvent).data);
                    if (payload?.adId) setAdLockStatus(String(payload.adId), !!payload.locked);
                } catch {}
                fetchAds(true);
                fetchTransactions(transactionFilterRef.current);
            });
        }

        fetch(`${API_URL}/coin-requests/active-topup-methods`)
            .then(r => r.json())
            .then(data => { if (data.success) setAdminMethods(data.data || []); })
            .catch(() => {})
            .finally(() => setLoadingAdmin(false));

        authFetch(`${API_URL}/coin-requests/my`)
            .then(r => r.json())
            .then(data => {
                const approved = (data.requests || []).some((r: any) => r.status === 'Verified');
                setHasApproval(approved);
            })
            .catch(() => setHasApproval(false));

        try {
            const token = getToken();
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const uid = payload.id ?? payload.userId ?? payload.sub;
                if (uid) setCurrentUserId(Number(uid));
            }
        } catch {
            authFetch(`${API_URL}/auth/profile`)
                .then(r => r.json())
                .then(data => {
                    const profile = data.user || data;
                    const uid = profile?.id ?? profile?.user_id;
                    if (uid) setCurrentUserId(Number(uid));
                })
                .catch(() => {});
        }

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            clearInterval(walletPollRef);
            stopBuyLockHeartbeat();
            eventSourceRef.current?.close();
        };
    }, []);

    useEffect(() => {
        transactionFilterRef.current = transactionFilter;
        fetchTransactions(transactionFilter);
    }, [transactionFilter]);

    // Seller: poll the specific transaction by ID while confirm popup is open
    useEffect(() => {
        if (!confirmTransaction || String(confirmTransaction.tx.id).startsWith('local-')) return;
        const txId = confirmTransaction.tx.id;
        const poll = setInterval(async () => {
            try {
                const res = await authFetch(`${API_URL}/p2p-ads/transactions/${txId}`);
                const data = await res.json();
                const live: P2PTransaction = data.transaction || data;
                if (!live?.id) return;
                setConfirmTransaction(prev =>
                    prev && String(prev.tx.id) === String(txId)
                        ? { ...prev, tx: { ...prev.tx, ...live } }
                        : prev
                );
            } catch {}
        }, 2000);
        return () => clearInterval(poll);
    }, [confirmTransaction?.tx.id]);

    // Buyer: poll the specific transaction by ID while view popup is open
    useEffect(() => {
        if (!buyerViewPopup || String(buyerViewPopup.tx.id).startsWith('local-')) return;
        const txId = buyerViewPopup.tx.id;
        const poll = setInterval(async () => {
            try {
                const res = await authFetch(`${API_URL}/p2p-ads/transactions/${txId}`);
                const data = await res.json();
                const live: P2PTransaction = data.transaction || data;
                if (!live?.id) return;
                setBuyerViewPopup(prev =>
                    prev && String(prev.tx.id) === String(txId)
                        ? { ...prev, tx: { ...prev.tx, ...live } }
                        : prev
                );
            } catch {}
        }, 2000);
        return () => clearInterval(poll);
    }, [buyerViewPopup?.tx.id]);

    // Full-screen image zoom viewer
    const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
    const [zoomScale, setZoomScale] = useState(1);
    const openZoom = (url: string) => { setZoomImageUrl(url); setZoomScale(1); };
    const closeZoom = () => { setZoomImageUrl(null); setZoomScale(1); };

    // Completed view popup: refresh once when opened to get latest screenshot_data
    useEffect(() => {
        if (!completedViewPopup || String(completedViewPopup.tx.id).startsWith('local-')) return;
        const txId = completedViewPopup.tx.id;
        authFetch(`${API_URL}/p2p-ads/transactions/${txId}`)
            .then(r => r.json())
            .then(data => {
                const live: P2PTransaction = data.transaction || data;
                if (!live?.id) return;
                setCompletedViewPopup(prev =>
                    prev && String(prev.tx.id) === String(txId)
                        ? { ...prev, tx: { ...prev.tx, ...live } }
                        : prev
                );
            })
            .catch(() => {});
    }, [completedViewPopup?.tx.id]);

    const findAdmin = (entry: CatalogEntry): AdminMethod | undefined =>
        adminMethods.find(a =>
            a.icon === entry.id ||
            a.icon === entry.svgFile?.replace('card_', '').replace('.svg', '') ||
            a.name.toLowerCase() === entry.name.toLowerCase()
        );

    const openForm = (entry: CatalogEntry, existing?: SavedPayment) => {
        const admin = findAdmin(entry);
        const cat = existing?.category || activeCategory;
        setFormEntry(entry);
        setFormAdmin(admin || null);
        setFormCategory(cat);
        setEditingId(existing?.id || null);
        setFormError(null);

        if (existing) {
            const vals: Record<string, string> = {};
            existing.adminFields.forEach(f => { vals[f.key] = f.value; });
            setAdminFieldVals(vals);
            const savedCountry = existing.adminFields.find(f => f.key === 'country')?.value || '';
            setCountry(savedCountry);
            setLkrRate(existing.lkrRate || '330');
            setCryptoCurrency(existing.cryptoCurrency || (cat === 'Crypto' ? 'USD' : 'LKR'));
            setMinAmount(existing.minAmount);
            setMaxAmount(existing.maxAmount);
            setReleaseValue(existing.releaseValue || '');
            setReleaseUnit(existing.releaseUnit || 'h');
            setAdDescription(existing.description || '');
        } else {
            const defaults: Record<string, string> = {};
            (admin?.fields || []).forEach(f => { defaults[f.key] = f.defaultValue ?? ''; });
            Object.assign(defaults, getSavedAssignmentFields(admin?.id));
            setAdminFieldVals(defaults);
            setLkrRate('330');
            setCryptoCurrency(cat === 'Crypto' ? 'USD' : 'LKR');
            setMinAmount('');
            setMaxAmount('');
            setReleaseValue('');
            setReleaseUnit('h');
            setAdDescription('');
            setCountry('');
        }
        setCountrySearch('');
        setShowCountryMenu(false);
        setShowCatalog(false);
    };

    const openEditForm = (payment: SavedPayment) => {
        const allEntries = Object.values(PAYMENT_CATALOG).flat();
        const entry = allEntries.find(e => e.id === payment.catalogId);
        if (entry) openForm(entry, payment);
    };

    const closeForm = () => { setFormEntry(null); setFormAdmin(null); setEditingId(null); setFormError(null); };

    const handleSave = async () => {
        setFormError(null);
        if (!formEntry) return;
        const emptyAdmin = (formAdmin?.fields || []).find(f => !(adminFieldVals[f.key] ?? f.defaultValue ?? '').toString().trim());
        if (emptyAdmin) { setFormError(`"${emptyAdmin.label}" is required.`); return; }
        if (!lkrRate.trim()) { setFormError('Rate is required.'); return; }
        if (!minAmount.trim()) { setFormError('Min Amount is required.'); return; }
        if (!maxAmount.trim()) { setFormError('Max Amount is required.'); return; }
        const minN = parseFloat(minAmount);
        const maxN = parseFloat(maxAmount);
        if (isNaN(minN) || minN <= 0) { setFormError('Min Amount must be greater than 0.'); return; }
        if (minN > walletBalance) { setFormError(`Min Amount cannot exceed your wallet balance (${walletBalance.toFixed(2)}).`); return; }
        if (isNaN(maxN) || maxN <= 0) { setFormError('Max Amount must be greater than 0.'); return; }
        if (maxN > walletBalance) { setFormError(`Max Amount cannot exceed your wallet balance (${walletBalance.toFixed(2)}).`); return; }
        if (minN > maxN) { setFormError('Min Amount cannot be greater than Max Amount.'); return; }
        if (formCategory === 'Bank' && !country.trim()) { setFormError('Country is required.'); return; }

        const adminFields = (formAdmin?.fields || []).map(f => ({
            key: f.key, label: f.label, value: adminFieldVals[f.key] ?? '', locked: f.locked,
        }));
        if (formCategory === 'Bank' && country.trim()) {
            adminFields.unshift({ key: 'country', label: 'Country', value: country.trim(), locked: false });
        }

        const payload = {
            catalog_id: formEntry.id,
            name: formEntry.name,
            category: formCategory,
            svg_file: formEntry.svgFile,
            clearbit_domain: formEntry.clearbitDomain,
            admin_fields: adminFields,
            lkr_rate: lkrRate.trim(),
            crypto_currency: cryptoCurrency,
            min_amount: minN,
            max_amount: maxN,
            release_value: releaseValue.trim() || null,
            release_unit: releaseUnit,
            description: adDescription.trim() || null,
        };

        setSaving(true);
        try {
            const url = editingId ? `${API_URL}/p2p-ads/${editingId}` : `${API_URL}/p2p-ads`;
            const method = editingId ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) { setFormError(data.message || 'Failed to save.'); return; }
            closeForm();
            fetchAds();
        } catch {
            setFormError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeleteError(null);
        setDeleting(true);
        try {
            const res = await fetch(`${API_URL}/p2p-ads/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                setDeleteError(data.message || `Failed to delete (HTTP ${res.status}).`);
                return;
            }
            setDeleteTarget(null);
            fetchAds();
        } catch (err: any) {
            setDeleteError(err?.message || 'Network error. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    const serverTransactionByAdId = transactions.reduce<Record<string, P2PTransaction>>((acc, tx) => {
        const adId = String(tx.ad_id);
        if (!acc[adId]) acc[adId] = tx;
        return acc;
    }, {});
    const latestTransactionByAdId: Record<string, P2PTransaction> = { ...serverTransactionByAdId };
    Object.entries(localTransactionsByAdId).forEach(([adId, localTx]) => {
        const serverTx = serverTransactionByAdId[adId];
        const localTime = new Date(localTx.created_at || 0).getTime();
        const serverTime = new Date(serverTx?.completed_at || serverTx?.created_at || 0).getTime();
        if (!serverTx || localTime >= serverTime) latestTransactionByAdId[adId] = localTx;
    });
    // Build synthetic per-transaction entries so every order gets its own card.
    const buildSyntheticPayments = (filterStatus: string): SavedPayment[] => {
        if (currentUserId === null) return [];
        const txsSorted = [...transactions]
            .filter(tx =>
                String(tx.status).toLowerCase() === filterStatus &&
                (String(tx.buyer_id) === String(currentUserId) || String(tx.seller_id) === String(currentUserId))
            )
            .sort((a, b) =>
                new Date(b.completed_at || b.created_at || 0).getTime() -
                new Date(a.completed_at || a.created_at || 0).getTime()
            );
        const result: SavedPayment[] = [];
        txsSorted.forEach(tx => {
            const synKey = `__ctxid_${tx.id}`;
            latestTransactionByAdId[synKey] = tx;
            const realPayment = payments.find(p => String(p.id) === String(tx.ad_id));
            result.push(realPayment
                ? { ...realPayment, id: synKey }
                : {
                    id: synKey,
                    catalogId: '',
                    name: tx.ad_name || `Ad #${tx.ad_id}`,
                    category: (tx as any).category || 'Other',
                    adminFields: [],
                    email: '',
                    lkrRate: '0',
                    cryptoCurrency: (tx as any).crypto_currency as SavedPayment['cryptoCurrency'],
                    minAmount: '0',
                    maxAmount: '0',
                    releaseValue: '',
                    releaseUnit: 'h' as const,
                    savedAt: tx.created_at || '',
                    isOwn: String(tx.seller_id) === String(currentUserId),
                    userId: Number(tx.seller_id),
                    username: String(tx.seller_id) === String(currentUserId)
                        ? tx.buyer_username
                        : tx.seller_username,
                    adStatus: 'active',
                } as SavedPayment
            );
        });
        return result;
    };
    const pendingSyntheticPayments = transactionFilter === 'pending' ? buildSyntheticPayments('pending') : [];
    const completedSyntheticPayments = transactionFilter === 'completed' ? buildSyntheticPayments('completed') : [];
    const cancelledSyntheticPayments = transactionFilter === 'cancelled' ? buildSyntheticPayments('cancelled') : [];
    const adsAfterCcyCountryFilter = payments.filter(p => {
        if (transactionFilter === 'all' && !p.isOwn && p.adStatus === 'inactive') return false;
        if (currencyFilter !== 'all') {
            const cur = p.cryptoCurrency || (p.category === 'Crypto' ? 'USDT' : 'LKR');
            if (cur !== currencyFilter) return false;
        }
        if (countryFilter) {
            const countryVal = p.adminFields.find(f => f.key === 'country')?.value || '';
            if (countryVal !== countryFilter) return false;
        }
        return true;
    });
    const filteredPayments = (() => {
        if (transactionFilter === 'all') return adsAfterCcyCountryFilter;
        const matched = adsAfterCcyCountryFilter.filter(payment => {
            const status = String(latestTransactionByAdId[payment.id]?.status || '').toLowerCase();
            return status === transactionFilter;
        });
        // Pending tab: each pending tx gets its own synthetic card, newest first
        if (transactionFilter === 'pending') return pendingSyntheticPayments;
        // Cancel tab: each cancelled tx gets its own synthetic card, newest first
        if (transactionFilter === 'cancelled') return cancelledSyntheticPayments;
        // Completed tab: each completed tx gets its own synthetic card, newest first
        if (transactionFilter === 'completed') return completedSyntheticPayments;
        return matched;
    })();

    const getDisplayAvailableAmount = (payment: SavedPayment) => {
        const serverAvailable = Number(payment.availableAmount ?? payment.maxAmount);
        const localTx = localTransactionsByAdId[payment.id];
        if (localTx?.status === 'pending' && localTx.reservesBalance) {
            return Math.max(0, serverAvailable - Number(localTx.receive_amount || localTx.amount || 0));
        }
        return serverAvailable;
    };

    const handleCancelPendingTransaction = async (tx: P2PTransaction, payment: SavedPayment) => {
        setLocalTransactionsByAdId(prev => ({
            ...prev,
            [payment.id]: { ...tx, status: 'cancelled', reservesBalance: false },
        }));
        setAdLockStatus(payment.id, false);
        try {
            if (String(tx.id).startsWith('local-')) {
                await fetch(`${API_URL}/p2p-ads/${payment.id}/cancel`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: tx.amount, receive_amount: tx.receive_amount }),
                });
            } else {
                await fetch(`${API_URL}/p2p-ads/transactions/${tx.id}/cancel`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}` },
                });
            }
        } catch {}
        fetchAds(true);
        fetchTransactions(transactionFilter);
        setTransactionFilter('all');
    };

    const openPendingDetails = (tx: P2PTransaction, payment: SavedPayment) => {
        if (payment.isOwn || String(tx.status).toLowerCase() !== 'pending') return;
        setPendingDetailsTx(tx);
        setBuyPopupAd(payment);
        setBuyStep('details');
        setBuyAmount(String(tx.amount || ''));
        setBuyTxId(tx.tx_id || '');
        buyScreenshotRef.current = null;
        setBuyScreenshot(null);
        setBuyError(null);
        setBuySuccess(false);
    };

    const openBuyerViewPopup = (tx: P2PTransaction, payment: SavedPayment) => {
        setBuyerViewPopup({ tx, payment });
        setViewTxId(String(tx.tx_id || ''));
        viewScreenshotRef.current = null;
        setViewScreenshot(null);
        setViewError(null);
    };

    const handleBuyerSubmitProof = async () => {
        if (!buyerViewPopup) return;
        const selectedScreenshot = viewScreenshotRef.current || viewScreenshot;
        if (!viewTxId.trim() && !selectedScreenshot) { setViewError('Please enter a Transaction ID or upload a payment screenshot.'); return; }
        setViewSubmitting(true);
        setViewError(null);
        try {
            const formData = new FormData();
            if (viewTxId.trim()) formData.append('tx_id', viewTxId.trim());
            if (selectedScreenshot) formData.append('screenshot', selectedScreenshot);
            const res = await authFetch(`${API_URL}/p2p-ads/transactions/${buyerViewPopup.tx.id}/submit-details`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) { setViewError(data.message || 'Failed to submit.'); return; }
            // Switch popup to view-only with submitted data immediately
            // Use '__submitted__' sentinel when only a screenshot was uploaded (tx_id empty)
            // so the popup correctly shows the submitted view (truthy check on tx_id)
            const submittedTxId = data.transaction?.tx_id || viewTxId.trim() || '__submitted__';
            setBuyerViewPopup(prev => prev ? {
                ...prev,
                tx: { ...prev.tx, tx_id: submittedTxId, screenshot_data: data.transaction?.screenshot_data || prev.tx.screenshot_data, screenshot_name: selectedScreenshot?.name || prev.tx.screenshot_name },
            } : null);
            setConfirmTransaction(prev => prev && String(prev.tx.id) === String(buyerViewPopup.tx.id) ? {
                ...prev,
                tx: { ...prev.tx, ...data.transaction, tx_id: submittedTxId, screenshot_name: selectedScreenshot?.name || data.transaction?.screenshot_name || prev.tx.screenshot_name },
            } : prev);
            // Refresh all transactions so seller's polling picks up the new data immediately
            fetchTransactions('all');
            fetchTransactions(transactionFilter);
            fetchWalletBalance();
        } catch {
            setViewError('Network error. Please try again.');
        } finally {
            setViewSubmitting(false);
        }
    };

    const handleConfirmPendingTransaction = async () => {
        if (!confirmTransaction) return;
        const { tx, payment } = confirmTransaction;
        setConfirmingTransaction(true);
        setLocalTransactionsByAdId(prev => ({
            ...prev,
            [payment.id]: { ...tx, status: 'completed', completed_at: new Date().toISOString(), reservesBalance: false },
        }));
        try {
            if (!String(tx.id).startsWith('local-')) {
                await fetch(`${API_URL}/p2p-ads/transactions/${tx.id}/confirm`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}` },
                });
            }
            setConfirmTransaction(null);
            setTransactionFilter('completed');
        } catch {
            fetchTransactions(transactionFilter);
        } finally {
            setConfirmingTransaction(false);
            fetchAds(true);
            fetchTransactions(transactionFilterRef.current);
        }
    };

    return (
        <div className="pb-10 relative min-h-screen">
            <div className="mb-3">
                <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors">
                    <IonIcon name="chevron-back-outline" className="text-base" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        disabled
                        className="flex items-center gap-1.5 font-black rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest shadow-md bg-emerald-500 text-black"
                    >
                        <IonIcon name="cash-outline" className="text-xs" />
                        Buy Coins
                    </button>
                    <button
                        onClick={onGoSell}
                        className="flex items-center gap-1.5 font-bold rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest transition-all bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 hover:text-white"
                    >
                        <IonIcon name="cash-outline" className="text-xs" />
                        Sell Coins
                    </button>
                    <button
                        onClick={onGoRequest}
                        className="flex items-center gap-1.5 font-bold rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest transition-all bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 hover:text-white"
                    >
                        <IonIcon name="paper-plane-outline" className="text-xs" />
                        Request
                    </button>
                </div>
                <button
                    onClick={() => {
                        if (hasApproval === false) setShowNoApproval(true); else setShowCatalog(true);
                    }}
                    className="flex items-center gap-1.5 font-bold rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest transition-all shadow-md bg-white text-black hover:bg-gray-100 active:scale-95"
                >
                    <IonIcon name="add-outline" className="text-xs" />
                    Post Ad
                </button>
            </div>
            <p className="text-gray-600 text-[11px] mb-3">Your active payment methods.</p>

            {/* ── Currency + Country filters ── */}
            <div className="flex items-center gap-2 mb-3">
                {/* Currency dropdown */}
                <div className="relative">
                    <select
                        value={currencyFilter}
                        onChange={e => setCurrencyFilter(e.target.value as 'all' | 'LKR' | 'USD' | 'USDT')}
                        className="appearance-none bg-[#0a0a0a] border border-gray-800 rounded-lg pl-3 pr-7 py-1.5 text-[10px] font-bold text-white focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer hover:bg-[#101013] transition-all"
                    >
                        <option value="all">All Currencies</option>
                        <option value="LKR">LKR</option>
                        <option value="USD">USD</option>
                        <option value="USDT">USDT</option>
                    </select>
                    <IonIcon name="chevron-down-outline" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]" />
                </div>

                {/* Country dropdown */}
                <div className="relative flex-1 min-w-0">
                    <button
                        type="button"
                        onClick={() => setShowCountryFilterMenu(s => !s)}
                        className="w-full flex items-center justify-between gap-2 bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#101013] transition-all"
                    >
                        <span className="flex items-center gap-2 min-w-0">
                            {(() => {
                                const c = countries.find(x => x.name === countryFilter);
                                if (c) {
                                    return (
                                        <>
                                            <img src={c.flagSvg} alt="" className="w-4 h-3 object-cover rounded-sm shrink-0" />
                                            <span className="truncate">{c.name}</span>
                                        </>
                                    );
                                }
                                return <span className="text-gray-400">All Countries</span>;
                            })()}
                        </span>
                        <IonIcon name="chevron-down-outline" className="text-gray-500 text-[10px] shrink-0" />
                    </button>
                    {showCountryFilterMenu && (
                        <div className="absolute z-20 mt-1 w-full bg-[#0a0a0a] border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
                            <div className="p-2 border-b border-gray-800">
                                <input
                                    type="text"
                                    value={countryFilterSearch}
                                    onChange={e => setCountryFilterSearch(e.target.value)}
                                    placeholder="Search…"
                                    className="w-full bg-[#030303] border border-gray-700/50 rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                                />
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                                <button
                                    type="button"
                                    onClick={() => { setCountryFilter(''); setShowCountryFilterMenu(false); setCountryFilterSearch(''); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                                >
                                    <span className="text-[11px] font-semibold text-gray-300">All Countries</span>
                                </button>
                                {countries
                                    .filter(c => !countryFilterSearch.trim() || c.name.toLowerCase().includes(countryFilterSearch.trim().toLowerCase()))
                                    .map(c => (
                                        <button
                                            key={c.cca2 || c.name}
                                            type="button"
                                            onClick={() => { setCountryFilter(c.name); setShowCountryFilterMenu(false); setCountryFilterSearch(''); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                                        >
                                            <img src={c.flagSvg} alt="" className="w-4 h-3 object-cover rounded-sm shrink-0" />
                                            <span className="text-[11px] font-semibold text-white truncate">{c.name}</span>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>

                {(currencyFilter !== 'all' || countryFilter) && (
                    <button
                        type="button"
                        onClick={() => { setCurrencyFilter('all'); setCountryFilter(''); }}
                        className="shrink-0 text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-widest px-2 py-1.5"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
                {[
                    { key: 'all', label: 'All' },
                    { key: 'pending', label: 'Pending' },
                    { key: 'completed', label: 'Complete' },
                    { key: 'cancelled', label: 'Cancel' },
                ].map(filter => (
                    <button
                        key={filter.key}
                        type="button"
                        onClick={() => setTransactionFilter(filter.key as TransactionFilter)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all shrink-0 ${
                            transactionFilter === filter.key
                                ? 'bg-white text-black border-white'
                                : 'bg-white/[0.04] text-gray-500 border-white/10 hover:text-white hover:border-white/20'
                        }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {false && <div className="mb-5 space-y-2">
                {transactions.length === 0 ? (
                    <div className="border border-dashed border-gray-800 rounded-xl px-4 py-3 text-center">
                        <p className="text-[10px] font-bold text-gray-600">No {transactionFilter === 'all' ? '' : transactionFilter} records</p>
                    </div>
                ) : (
                    transactions.slice(0, 5).map(tx => {
                        const status = String(tx.status || 'pending').toLowerCase();
                        const statusClass = status === 'completed'
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : status === 'cancelled'
                                ? 'text-red-400 bg-red-500/10'
                                : 'text-amber-400 bg-amber-500/10';
                        return (
                            <div key={tx.id} className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] text-white font-bold truncate">{tx.ad_name || 'Payment Ad'}</p>
                                    <p className="text-[9px] text-gray-600 mt-0.5">
                                        {tx.created_at ? new Date(tx.created_at).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : 'Transaction'} · R {Number(tx.amount || 0).toLocaleString()}
                                    </p>
                                </div>
                                <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0 ${statusClass}`}>
                                    {status === 'completed' ? 'Complete' : status === 'cancelled' ? 'Cancel' : 'Pending'}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>}

            {/* P2P-style payment ad cards */}
            {loadingAds ? (
                <div className="flex items-center justify-center py-20 opacity-30">
                    <IonIcon name="reload-outline" className="animate-spin text-2xl" />
                </div>
            ) : filteredPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20 gap-2">
                    <IonIcon name="card-outline" className="text-4xl" />
                    <p className="text-[10px] font-black uppercase tracking-widest">
                        {transactionFilter === 'all' ? 'No ads posted yet' : `No ${transactionFilter} ads`}
                    </p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {(() => {
                        // Sellers locked for this buyer: pending tx that has NOT been submitted yet (no tx_id)
                        const lockedSellerIds = new Set(
                            Object.values(latestTransactionByAdId)
                                .filter(t => String(t.status).toLowerCase() === 'pending' && !t.tx_id)
                                .map(t => String(t.seller_id))
                        );
                        return filteredPayments.map(p => {
                        const isOwn = !!p.isOwn;
                        const avatar = p.profilePicture;
                        const username = p.username || 'User';
                        const currency = p.cryptoCurrency || (p.category === 'Crypto' ? 'USDT' : 'LKR');
                        const tx = latestTransactionByAdId[p.id];
                        const txStatus = String(tx?.status || '').toLowerCase();
                        const isSellerLocked = !isOwn && lockedSellerIds.has(String(p.userId));
                        const txStatusClass = txStatus === 'completed'
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : txStatus === 'cancelled'
                                ? 'text-red-400 bg-red-500/10'
                                : 'text-amber-400 bg-amber-500/10';
                        const displayAvailable = getDisplayAvailableAmount(p);
                        const displayMinRupee = Number(p.minAmount);
                        const displayMaxRupee = Number(p.maxAmount);
                        const displayAvailableRupee = displayAvailable;
                        return (
                            <div
                                key={p.id}
                                onClick={() => {
                                    if (isOwn && transactionFilter === 'pending' && tx && txStatus === 'pending') setConfirmTransaction({ tx, payment: p });
                                    else if (!isOwn && transactionFilter === 'pending' && tx && txStatus === 'pending') openBuyerViewPopup(tx, p);
                                    else if (transactionFilter === 'completed' && tx && txStatus === 'completed') setCompletedViewPopup({ tx, payment: p });
                                }}
                                className={`bg-[#0d0d0d] border border-gray-800/70 rounded-2xl overflow-hidden transition-colors ${
                                    transactionFilter === 'pending' && tx && txStatus === 'pending'
                                        ? 'cursor-pointer hover:border-amber-500/40'
                                        : transactionFilter === 'completed' && tx && txStatus === 'completed'
                                            ? 'cursor-pointer hover:border-emerald-500/40'
                                            : ''
                                }`}
                            >
                                {/* Top section */}
                                <div className="px-4 pt-4 pb-3">
                                    {/* User row */}
                                    <div className="flex items-center gap-2 mb-1.5">
                                        {avatar
                                            ? <img src={avatar} className="w-7 h-7 rounded-full object-cover shrink-0 border border-gray-700" />
                                            : <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                                <span className="text-[10px] font-black text-emerald-400">{username.charAt(0).toUpperCase()}</span>
                                              </div>
                                        }
                                        <span className="text-[12px] font-bold text-white">{username}</span>
                                        <IonIcon name="checkmark-circle" className="text-emerald-400 text-sm" />
                                        {(transactionFilter === 'pending' || transactionFilter === 'completed') && tx && (txStatus === 'pending' || txStatus === 'completed') && (() => {
                                            const chatPartnerId = isOwn ? tx.buyer_id : p.userId;
                                            const chatPartnerName = isOwn
                                                ? (tx.buyer_username || 'Buyer')
                                                : (tx.seller_username || username || 'Seller');
                                            if (!chatPartnerId) return null;
                                            return (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setChatPopup({
                                                            userId: String(chatPartnerId),
                                                            name: chatPartnerName,
                                                            roleLabel: isOwn ? 'Buyer Chat' : 'Seller Chat',
                                                            orderLabel: `Order #${getOrderId(tx)} · ${p.name}`,
                                                        });
                                                    }}
                                                    title={isOwn ? `Chat with buyer ${chatPartnerName}` : `Chat with seller ${chatPartnerName}`}
                                                    className="ml-auto inline-flex items-center gap-1.5 max-w-[150px] min-w-0 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2 text-emerald-400 transition-all active:scale-95"
                                                >
                                                    <span className="text-[10px] font-bold text-emerald-300 truncate">{chatPartnerName}</span>
                                                    <IonIcon name="chatbubble-ellipses-outline" className="text-[13px]" />
                                                </button>
                                            );
                                        })()}
                                    </div>
                                    {/* Rate row + right column */}
                                    <div className="flex items-end justify-between gap-3">
                                        {/* Left: rate + limit + available */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-0.5 mb-2">
                                                <span className="text-[13px] font-black text-gray-400 mr-0.5">R</span>
                                                <span className="text-2xl font-black text-white tracking-tight">{p.lkrRate}</span>
                                                <span className="text-[11px] text-gray-500 ml-1">/{currency}</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-500">
                                                    <span className="text-gray-600">Limit</span>
                                                    {'  '}
                                                    <span className="text-gray-300 font-semibold">R {displayMinRupee.toLocaleString()} – R {displayMaxRupee.toLocaleString()}</span>
                                                </p>
                                                <p className="text-[10px] text-gray-500">
                                                    <span className="text-gray-600">Available</span>
                                                    {'  '}
                                                    <span className="text-gray-300 font-semibold">R {displayAvailableRupee.toLocaleString()}</span>
                                                </p>
                                                {isOwn && p.adStatus === 'inactive' && (
                                                    <p className="text-[9px] text-red-400 font-bold">Inactive · wallet below balance</p>
                                                )}
                                                {(transactionFilter === 'pending' || transactionFilter === 'completed') && tx && (() => {
                                                    const ts = transactionFilter === 'completed'
                                                        ? (tx.completed_at || tx.created_at)
                                                        : tx.created_at;
                                                    const orderId = getOrderId(tx);
                                                    const releaseCountdown = transactionFilter === 'pending'
                                                        ? getReleaseCountdown(tx, p, nowMs)
                                                        : null;
                                                    return (
                                                        <>
                                                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                                <span className="text-gray-600">Order ID</span>
                                                                <span className="text-gray-300 font-semibold font-mono">{orderId}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); copyText(orderId); }}
                                                                    className="text-gray-600 hover:text-emerald-400 transition-colors"
                                                                    title="Copy order ID"
                                                                >
                                                                    <IonIcon name="copy-outline" className="text-[10px]" />
                                                                </button>
                                                            </div>
                                                            {ts && (
                                                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                                    <IonIcon name="time-outline" className="text-gray-600 text-[10px]" />
                                                                    <span className="text-gray-600">{transactionFilter === 'completed' ? 'Confirmed' : (releaseCountdown ? 'Time Left' : 'Started')}</span>
                                                                    <span className="text-gray-300 font-semibold">{releaseCountdown || new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Right: payment method + time + button */}
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <div className="text-right">
                                                <div className="flex items-center justify-end gap-1.5 mb-0.5">
                                                    <span className="text-[11px] font-bold text-gray-300">{p.name}</span>
                                                    <div className="w-4 h-4 bg-white rounded flex items-center justify-center p-0.5 overflow-hidden">
                                                        <PaymentLogo name={p.name} svgFile={p.svgFile} clearbitDomain={p.clearbitDomain} />
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const adCountry = p.adminFields.find(f => f.key === 'country')?.value || '';
                                                    if (!adCountry) return null;
                                                    const c = countries.find(x => x.name === adCountry);
                                                    return (
                                                        <div className="flex items-center justify-end gap-1 mb-0.5">
                                                            {c && <img src={c.flagSvg} alt="" className="w-3.5 h-2.5 object-cover rounded-[2px] shrink-0" />}
                                                            <span className="text-[9px] text-gray-500 font-semibold">{adCountry}</span>
                                                        </div>
                                                    );
                                                })()}
                                                {p.releaseValue && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <IonIcon name="time-outline" className="text-gray-600 text-[10px]" />
                                                        <span className="text-[10px] text-gray-500">{p.releaseValue} {p.releaseUnit}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {isOwn && transactionFilter === 'pending' && tx && txStatus === 'pending' ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                                            <IonIcon name="time-outline" className="text-amber-400 text-[10px]" />
                                                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">Pending</span>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setConfirmTransaction({ tx, payment: p }); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-100 text-black font-black rounded-xl text-[10px] transition-all active:scale-95"
                                                        >
                                                            <IonIcon name="eye-outline" className="text-xs" />
                                                            View
                                                        </button>
                                                    </div>
                                                    {renderCardReportBadges(tx)}
                                                    {!getOwnReportReason(tx) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openReportPopup(tx, p); }}
                                                            className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest transition-all active:scale-95"
                                                        >
                                                            <IonIcon name="flag-outline" className="text-[9px]" />
                                                            Report
                                                        </button>
                                                    )}
                                                </div>
                                            ) : isOwn && transactionFilter === 'completed' && tx && txStatus === 'completed' ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                                            <IonIcon name="checkmark-circle-outline" className="text-emerald-400 text-[10px]" />
                                                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Completed</span>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setCompletedViewPopup({ tx, payment: p }); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-white/[0.07] hover:bg-white/[0.12] text-gray-300 hover:text-white font-black rounded-xl text-[10px] transition-all active:scale-95"
                                                        >
                                                            <IonIcon name="eye-outline" className="text-xs" />
                                                            View
                                                        </button>
                                                    </div>
                                                    {renderCardReportBadges(tx)}
                                                    {!getOwnReportReason(tx) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openReportPopup(tx, p); }}
                                                            className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest transition-all active:scale-95"
                                                        >
                                                            <IonIcon name="flag-outline" className="text-[9px]" />
                                                            Report
                                                        </button>
                                                    )}
                                                </div>
                                            ) : isOwn && transactionFilter === 'cancelled' ? (
                                                <div className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg">
                                                    <IonIcon name="close-circle-outline" className="text-red-400 text-[10px]" />
                                                    <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">Cancelled</span>
                                                </div>
                                            ) : isOwn ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => { if (p.adStatus !== 'locked') openEditForm(p); }}
                                                            disabled={p.adStatus === 'locked'}
                                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 ${p.adStatus === 'locked' ? 'bg-white/[0.03] text-gray-700 cursor-not-allowed' : 'bg-white/[0.07] hover:bg-white/12 text-gray-400 hover:text-white'}`}>
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => { if (p.adStatus !== 'locked') setDeleteTarget(p.id); }}
                                                            disabled={p.adStatus === 'locked'}
                                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 ${p.adStatus === 'locked' ? 'bg-red-500/[0.04] text-red-900 cursor-not-allowed' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400'}`}>
                                                            Delete
                                                        </button>
                                                    </div>
                                                    {p.adStatus === 'locked' && (
                                                        <div className="flex items-center gap-1">
                                                            <IonIcon name="lock-closed-outline" className="text-amber-500 text-[9px]" />
                                                            <span className="text-[8px] text-amber-600 font-bold">Locked · transaction in progress</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                transactionFilter === 'pending' && tx && txStatus === 'pending' ? (
                                                    <div className="flex flex-col items-end gap-1.5">
                                                        <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                                            <IonIcon name="time-outline" className="text-amber-400 text-[10px]" />
                                                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">Pending</span>
                                                        </div>
                                                        {!tx?.tx_id && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleCancelPendingTransaction(tx, p); }}
                                                                className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest transition-all active:scale-95"
                                                            >
                                                                Cancel
                                                            </button>
                                                        )}
                                                        {renderCardReportBadges(tx)}
                                                        {!getOwnReportReason(tx) && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); openReportPopup(tx, p); }}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest transition-all active:scale-95"
                                                            >
                                                                <IonIcon name="flag-outline" className="text-[9px]" />
                                                                Report
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : transactionFilter === 'completed' && tx && txStatus === 'completed' ? (
                                                    <div className="flex flex-col items-end gap-1.5">
                                                        <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                                            <IonIcon name="checkmark-circle-outline" className="text-emerald-400 text-[10px]" />
                                                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Completed</span>
                                                        </div>
                                                        {renderCardReportBadges(tx)}
                                                        {!getOwnReportReason(tx) && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); openReportPopup(tx, p); }}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest transition-all active:scale-95"
                                                            >
                                                                <IonIcon name="flag-outline" className="text-[9px]" />
                                                                Report
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : transactionFilter === 'cancelled' ? (
                                                    <div className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg">
                                                        <IonIcon name="close-circle-outline" className="text-red-400 text-[10px]" />
                                                        <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">Cancelled</span>
                                                    </div>
                                                ) : p.adStatus === 'inactive' ? (
                                                    <button
                                                        disabled
                                                        className="px-6 py-2 bg-red-500/10 text-red-500 font-black rounded-xl text-xs tracking-wide cursor-not-allowed border border-red-500/10"
                                                    >
                                                        Inactive
                                                    </button>
                                                ) : isSellerLocked ? (
                                                    <button
                                                        disabled
                                                        className="px-6 py-2 bg-white/5 text-gray-600 font-black rounded-xl text-xs tracking-wide cursor-not-allowed border border-white/5"
                                                    >
                                                        Buy
                                                    </button>
                                                ) : (
                                                    <button onClick={(e) => { e.stopPropagation(); openBuyPopup(p); }}
                                                        className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-xl text-xs tracking-wide transition-all active:scale-95 shadow-lg shadow-emerald-500/20">
                                                        Buy
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    });
                    })()}
                </div>
            )}

            <div className="h-20 md:hidden" />

            {/* ── Delete Confirm Popup ── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteTarget(null)} />
                    <div className="relative w-full sm:max-w-xs bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                            <IonIcon name="trash-outline" className="text-red-400 text-lg" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">Delete Ad?</h3>
                            <p className="text-[11px] text-gray-500">This ad will be permanently removed.</p>
                        </div>
                        {deleteError && (
                            <div className="w-full flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                <IonIcon name="alert-circle-outline" className="text-red-400 text-sm shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold text-red-400 text-left">{deleteError}</p>
                            </div>
                        )}
                        <div className="flex gap-2 w-full">
                            <button onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                                className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                Cancel
                            </button>
                            <button onClick={() => handleDelete(deleteTarget)} disabled={deleting}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Buyer Pending Detail / Proof Submission Popup ── */}
            {buyerViewPopup && (() => {
                const buyerHasProof = !!(buyerViewPopup.tx.tx_id || buyerViewPopup.tx.screenshot_data || buyerViewPopup.tx.screenshot_name);
                return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setBuyerViewPopup(null)} />
                    <div className="relative w-full sm:max-w-md bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    <PaymentLogo name={buyerViewPopup.payment.name} svgFile={buyerViewPopup.payment.svgFile} clearbitDomain={buyerViewPopup.payment.clearbitDomain} />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">{buyerViewPopup.payment.name}</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-black uppercase tracking-wider">Pending</span>
                                        {buyerHasProof && <span className="text-[8px] text-gray-500">· Submitted</span>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setBuyerViewPopup(null)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                            {/* Amount summary */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Enter Amount</p>
                                    <p className="text-sm font-black text-white">{Number(buyerViewPopup.tx.amount || 0).toLocaleString()} <span className="text-xs text-gray-500">{buyerViewPopup.payment.cryptoCurrency || (buyerViewPopup.payment.category === 'Crypto' ? 'USDT' : 'LKR')}</span></p>
                                </div>
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">You Receive</p>
                                    <p className="text-sm font-black text-emerald-400">R {Number(buyerViewPopup.tx.receive_amount || 0).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Seller payment details */}
                            {buyerViewPopup.payment.adminFields.length > 0 && (
                                <div className="bg-[#0a0a0a] border border-gray-800/50 rounded-xl px-4 py-3 space-y-2.5">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-600">Send Payment To</p>
                                    {buyerViewPopup.payment.adminFields.map(f => {
                                        const countryMatch = f.key === 'country' ? countries.find(c => c.name === f.value) : null;
                                        return (
                                            <div key={f.key} className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] text-gray-600 shrink-0">{f.label}</span>
                                                <div className="flex items-center gap-1.5">
                                                    {countryMatch && <img src={countryMatch.flagSvg} alt="" className="w-4 h-3 object-cover rounded-sm shrink-0" />}
                                                    <span className="text-[10px] font-bold text-gray-200 text-right break-all">{f.value || '—'}</span>
                                                    {f.value && (
                                                        <button type="button" onClick={() => navigator.clipboard.writeText(f.value)} className="shrink-0 text-gray-600 hover:text-emerald-400 transition-colors">
                                                            <IonIcon name="copy-outline" className="text-[13px]" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* If already submitted — view only */}
                            {buyerHasProof ? (
                                <>
                                    {buyerViewPopup.tx.tx_id && buyerViewPopup.tx.tx_id !== '__submitted__' && (
                                    <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                        <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Transaction ID</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-white break-all flex-1">{buyerViewPopup.tx.tx_id}</p>
                                            <button onClick={() => navigator.clipboard.writeText(buyerViewPopup.tx.tx_id || '')} className="shrink-0 text-gray-600 hover:text-emerald-400">
                                                <IonIcon name="copy-outline" className="text-[13px]" />
                                            </button>
                                        </div>
                                    </div>
                                    )}
                                    <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                        <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-2">Payment Proof</p>
                                        {buyerViewPopup.tx.screenshot_data ? (
                                            <button type="button" onClick={() => openZoom(resolveProofUrl(buyerViewPopup.tx.screenshot_data))} className="relative block w-full">
                                                <img src={resolveProofUrl(buyerViewPopup.tx.screenshot_data)} alt="proof" className="w-full max-h-60 object-contain rounded-lg border border-gray-800 bg-black" />
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="w-11 h-11 rounded-full bg-black/60 border border-white/25 flex items-center justify-center shadow-xl">
                                                            <IonIcon name="search-outline" className="text-white text-2xl" />
                                                        </div>
                                                        <span className="text-[8px] font-black text-white uppercase tracking-widest bg-black/50 px-2 py-0.5 rounded-full">Zoom</span>
                                                    </div>
                                                </div>
                                            </button>
                                        ) : (
                                            <p className="text-[10px] text-gray-600">{buyerViewPopup.tx.screenshot_name || 'No image available'}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3">
                                        <IonIcon name="time-outline" className="text-amber-400 text-sm shrink-0" />
                                        <p className="text-[10px] text-amber-400 font-semibold">Submitted · Waiting for seller confirmation</p>
                                    </div>
                                </>
                            ) : (
                                /* Not yet submitted — show form */
                                <>
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Transaction ID <span className="text-red-400">*</span></label>
                                        <input type="text" value={viewTxId} onChange={e => { setViewTxId(e.target.value); setViewError(null); }}
                                            placeholder="e.g. TXN123456789"
                                            className="w-full bg-[#030303] border border-gray-700/50 rounded-lg px-3 py-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-[#0b0b0b] transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Payment Screenshot</label>
                                        <label className="flex flex-col items-center justify-center gap-2 w-full border border-dashed border-gray-700/60 rounded-xl py-5 cursor-pointer hover:border-gray-600 hover:bg-white/[0.02] transition-all">
                                            {viewScreenshot ? (
                                                <><IonIcon name="image-outline" className="text-emerald-400 text-xl" /><span className="text-[10px] text-emerald-400 font-bold">{viewScreenshot.name}</span><span className="text-[9px] text-gray-600">Tap to change</span></>
                                            ) : (
                                                <><IonIcon name="cloud-upload-outline" className="text-gray-600 text-2xl" /><span className="text-[10px] text-gray-500 font-semibold">Tap to upload screenshot</span></>
                                            )}
                                            <input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0] || null; viewScreenshotRef.current = file; setViewScreenshot(file); setViewError(null); }} />
                                        </label>
                                    </div>
                                    {viewError && (
                                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                            <IonIcon name="alert-circle-outline" className="text-red-400 text-sm shrink-0" />
                                            <p className="text-[10px] font-bold text-red-400">{viewError}</p>
                                        </div>
                                    )}
                                </>
                            )}
                            {renderReportPanel(buyerViewPopup.tx, buyerViewPopup.payment)}
                        </div>

                        {/* Footer */}
                        {!buyerHasProof && (
                            <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0 flex gap-2">
                                <button onClick={() => setBuyerViewPopup(null)} className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                    Close
                                </button>
                                <button onClick={handleBuyerSubmitProof} disabled={viewSubmitting}
                                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                    <IonIcon name="paper-plane-outline" className="text-xs" />
                                    {viewSubmitting ? 'Submitting…' : 'Submit'}
                                </button>
                            </div>
                        )}
                        {buyerHasProof && (
                            <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0">
                                <button onClick={() => setBuyerViewPopup(null)} className="w-full py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                    Close
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                );
            })()}

            {/* ── Completed Transaction View Popup (buyer & seller) ── */}
            {completedViewPopup && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setCompletedViewPopup(null)} />
                    <div className="relative w-full sm:max-w-md bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    <PaymentLogo name={completedViewPopup.payment.name} svgFile={completedViewPopup.payment.svgFile} clearbitDomain={completedViewPopup.payment.clearbitDomain} />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">{completedViewPopup.payment.name}</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-black uppercase tracking-wider">Completed</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setCompletedViewPopup(null)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                            {/* Amount summary */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Amount</p>
                                    <p className="text-sm font-black text-white">
                                        {Number(completedViewPopup.tx.amount || 0).toLocaleString()}
                                        <span className="text-xs text-gray-500 ml-1">{completedViewPopup.payment.cryptoCurrency || (completedViewPopup.payment.category === 'Crypto' ? 'USDT' : 'LKR')}</span>
                                    </p>
                                </div>
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Received</p>
                                    <p className="text-sm font-black text-emerald-400">R {Number(completedViewPopup.tx.receive_amount || 0).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Order ID & completion time */}
                            <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] text-gray-600 uppercase tracking-wider font-bold">Order ID</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-gray-300 font-mono">{getOrderId(completedViewPopup.tx)}</span>
                                        <button type="button" onClick={() => copyText(getOrderId(completedViewPopup.tx))} className="text-gray-600 hover:text-emerald-400 transition-colors">
                                            <IonIcon name="copy-outline" className="text-[11px]" />
                                        </button>
                                    </div>
                                </div>
                                {(completedViewPopup.tx.completed_at || completedViewPopup.tx.created_at) && (
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[9px] text-gray-600 uppercase tracking-wider font-bold">Confirmed</span>
                                        <span className="text-[10px] font-bold text-gray-300">
                                            {new Date(completedViewPopup.tx.completed_at || completedViewPopup.tx.created_at || '').toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Transaction ID */}
                            {completedViewPopup.tx.tx_id && (
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Transaction ID</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-white break-all flex-1">{completedViewPopup.tx.tx_id}</p>
                                        <button onClick={() => navigator.clipboard.writeText(completedViewPopup.tx.tx_id || '')} className="shrink-0 text-gray-600 hover:text-emerald-400">
                                            <IonIcon name="copy-outline" className="text-[13px]" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Payment proof image */}
                            {(completedViewPopup.tx.screenshot_data || completedViewPopup.tx.screenshot_name) && (
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-2">Payment Proof</p>
                                    {completedViewPopup.tx.screenshot_data ? (
                                        <button type="button" onClick={() => openZoom(resolveProofUrl(completedViewPopup.tx.screenshot_data))} className="relative block w-full">
                                            <img
                                                src={resolveProofUrl(completedViewPopup.tx.screenshot_data)}
                                                alt={completedViewPopup.tx.screenshot_name || 'Payment screenshot'}
                                                className="w-full max-h-72 object-contain rounded-lg border border-gray-800 bg-black"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="w-11 h-11 rounded-full bg-black/60 border border-white/25 flex items-center justify-center shadow-xl">
                                                        <IonIcon name="search-outline" className="text-white text-2xl" />
                                                    </div>
                                                    <span className="text-[8px] font-black text-white uppercase tracking-widest bg-black/50 px-2 py-0.5 rounded-full">Zoom</span>
                                                </div>
                                            </div>
                                        </button>
                                    ) : (
                                        <p className="text-[10px] text-gray-600">{completedViewPopup.tx.screenshot_name}</p>
                                    )}
                                </div>
                            )}

                            {/* Completion confirmation banner */}
                            <div className="flex items-center gap-2 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-4 py-3">
                                <IonIcon name="checkmark-circle-outline" className="text-emerald-400 text-sm shrink-0" />
                                <p className="text-[10px] text-emerald-400 font-semibold">Transaction confirmed · Coins released to buyer</p>
                            </div>
                            {renderReportPanel(completedViewPopup.tx, completedViewPopup.payment)}
                        </div>

                        <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0">
                            <button onClick={() => setCompletedViewPopup(null)} className="w-full py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Buy Popup Step 1: Amount ── */}
            {confirmTransaction && (() => {
                const hasProof = !!(confirmTransaction.tx.tx_id || confirmTransaction.tx.screenshot_data || confirmTransaction.tx.screenshot_name);
                return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmTransaction(null)} />
                    <div className="relative w-full sm:max-w-md bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    <PaymentLogo name={confirmTransaction.payment.name} svgFile={confirmTransaction.payment.svgFile} clearbitDomain={confirmTransaction.payment.clearbitDomain} />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">{confirmTransaction.payment.name}</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-black uppercase tracking-wider">Pending</span>
                                        {hasProof && <span className="text-[8px] text-gray-500">· Submitted</span>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setConfirmTransaction(null)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Amount</p>
                                    <p className="text-sm font-black text-white">R {Number(confirmTransaction.tx.amount || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Receive</p>
                                    <p className="text-sm font-black text-emerald-400">{confirmTransaction.tx.receive_amount || '0.00'}</p>
                                </div>
                            </div>
                            {hasProof ? (
                                <>
                                    {confirmTransaction.tx.tx_id && (
                                        <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                            <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Transaction ID</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-bold text-white break-all flex-1">{confirmTransaction.tx.tx_id}</p>
                                                <button onClick={() => navigator.clipboard.writeText(confirmTransaction.tx.tx_id || '')} className="shrink-0 text-gray-600 hover:text-emerald-400">
                                                    <IonIcon name="copy-outline" className="text-[13px]" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {(confirmTransaction.tx.screenshot_data || confirmTransaction.tx.screenshot_name) && (
                                        <div className="bg-[#090909] border border-gray-800/70 rounded-xl px-4 py-3">
                                            <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-2">Payment Proof</p>
                                            {confirmTransaction.tx.screenshot_data ? (
                                                <button type="button" onClick={() => openZoom(resolveProofUrl(confirmTransaction.tx.screenshot_data))} className="relative block w-full">
                                                    <img src={resolveProofUrl(confirmTransaction.tx.screenshot_data)} alt={confirmTransaction.tx.screenshot_name || 'Payment screenshot'} className="w-full max-h-80 object-contain rounded-lg border border-gray-800 bg-black" />
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <div className="flex flex-col items-center gap-1">
                                                            <div className="w-11 h-11 rounded-full bg-black/60 border border-white/25 flex items-center justify-center shadow-xl">
                                                                <IonIcon name="search-outline" className="text-white text-2xl" />
                                                            </div>
                                                            <span className="text-[8px] font-black text-white uppercase tracking-widest bg-black/50 px-2 py-0.5 rounded-full">Zoom</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            ) : (
                                                <p className="text-[10px] text-gray-600">{confirmTransaction.tx.screenshot_name}</p>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3">
                                        <IonIcon name="time-outline" className="text-amber-400 text-sm shrink-0" />
                                        <p className="text-[10px] text-amber-400 font-semibold">Submitted · Ready for your confirmation</p>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3">
                                    <IonIcon name="time-outline" className="text-amber-400 text-sm shrink-0" />
                                    <p className="text-[10px] text-amber-400 font-semibold">Waiting for buyer to submit transaction details.</p>
                                </div>
                            )}
                            {renderReportPanel(confirmTransaction.tx, confirmTransaction.payment)}
                        </div>
                        <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0 flex gap-2">
                            <button onClick={() => setConfirmTransaction(null)} className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">Close</button>
                            <button onClick={handleConfirmPendingTransaction} disabled={confirmingTransaction || !hasProof} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                {confirmingTransaction ? 'Confirming' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {buyPopupAd && buyStep === 'amount' && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" />
                    <div className="relative w-full sm:max-w-sm bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    <PaymentLogo name={buyPopupAd.name} svgFile={buyPopupAd.svgFile} clearbitDomain={buyPopupAd.clearbitDomain} />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">{buyPopupAd.name}</h2>
                                    <p className="text-[9px] text-gray-500">
                                        R {buyPopupAd.lkrRate} / {buySellerCurrency}
                                        {buyPopupAd.releaseValue ? ` · ${buyPopupAd.releaseValue}${buyPopupAd.releaseUnit}` : ''}
                                    </p>
                                </div>
                            </div>
                            <button onClick={closeBuyPopup} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>
                        <div className="px-5 py-5 space-y-4">
                            <div className="flex items-center justify-between bg-[#0a0a0a] border border-gray-800/50 rounded-xl px-4 py-3">
                                {(() => {
                                    const liveAvailable = getDisplayAvailableAmount(buyPopupAd);
                                    const minRupee = Number(buyPopupAd.minAmount);
                                    const maxRupee = Number(buyPopupAd.maxAmount);
                                    const availableRupee = liveAvailable;
                                    return (
                                        <>
                                            <div>
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wider font-bold mb-0.5">Limit</p>
                                                <p className="text-[11px] text-gray-300 font-semibold">R {minRupee.toLocaleString()} – R {maxRupee.toLocaleString()}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wider font-bold mb-0.5">Available</p>
                                                <p className="text-[11px] text-emerald-400 font-bold">R {availableRupee.toLocaleString()}</p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Enter Amount ({buySellerCurrency}) <span className="text-red-400">*</span></label>
                                <div className="flex items-center bg-[#030303] border border-gray-700/50 rounded-lg overflow-hidden">
                                    <input type="number" value={buyAmount} onChange={e => handleBuyAmountChange(e.target.value)}
                                        placeholder={`Min ${buySellerCurrency} ${(Number(buyPopupAd.minAmount) / Math.max(parseFloat(buyPopupAd.lkrRate || '1'), 0.0001)).toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
                                        autoFocus
                                        className="flex-1 bg-transparent px-3 py-2.5 text-sm font-bold text-white focus:outline-none min-w-0" />
                                    <span className="pr-3 text-[9px] font-black text-gray-500 shrink-0">{buySellerCurrency}</span>
                                </div>
                            </div>
                            <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${buyError ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/[0.06] border border-emerald-500/20'}`}>
                                <span className="text-[10px] text-gray-500 font-semibold">You will receive</span>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-base font-black ${buyError ? 'text-red-400' : 'text-emerald-400'}`}>{buyReceiveAmount}</span>
                                    <span className="text-[10px] text-gray-500">R</span>
                                </div>
                            </div>
                            {buyError && (
                                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                    <IonIcon name="alert-circle-outline" className="text-red-400 text-sm shrink-0" />
                                    <p className="text-[10px] font-bold text-red-400">{buyError}</p>
                                </div>
                            )}
                            <GuideNote guide={DEFAULT_BUY_POPUP_DESCRIPTION} description={buyPopupAd.description} />
                            <div className="flex gap-2 pt-1">
                                <button onClick={closeBuyPopup} className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">Cancel</button>
                                <button onClick={handleBuyNow} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/20">Make Payment</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Buy Popup Step 2: Payment Details ── */}
            {buyPopupAd && buyStep === 'details' && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" />
                    <div className="relative w-full sm:max-w-md bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    <PaymentLogo name={buyPopupAd.name} svgFile={buyPopupAd.svgFile} clearbitDomain={buyPopupAd.clearbitDomain} />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">Payment Details</h2>
                                    <p className="text-[9px] text-gray-500">{buySellerCurrency} {buyAmount} → R {buyReceiveAmount}</p>
                                </div>
                            </div>
                        </div>
                        {buySuccess ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
                                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                    <IonIcon name="checkmark-circle" className="text-emerald-400 text-3xl" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white mb-1">Order Submitted</h3>
                                    <p className="text-[11px] text-gray-500 leading-relaxed">Your buy request has been submitted.<br />The seller will release your coins shortly.</p>
                                </div>
                                <button onClick={closeBuyPopup} className="mt-2 px-8 py-2.5 bg-white text-black font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">Done</button>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                                    <GuideNote guide={DEFAULT_BUY_POPUP_DESCRIPTION} description={buyPopupAd.description} />
                                    {buyPopupAd.adminFields.length > 0 && (
                                        <div className="bg-[#0a0a0a] border border-gray-800/50 rounded-xl px-4 py-3 space-y-2.5">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-2">Send Payment To</p>
                                            {buyPopupAd.adminFields.map(f => {
                                                const countryMatch = f.key === 'country' ? countries.find(c => c.name === f.value) : null;
                                                return (
                                                    <div key={f.key} className="flex items-center justify-between gap-2">
                                                        <span className="text-[10px] text-gray-600 shrink-0">{f.label}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {countryMatch && <img src={countryMatch.flagSvg} alt="" className="w-4 h-3 object-cover rounded-sm shrink-0" />}
                                                            <span className="text-[10px] font-bold text-gray-200 text-right break-all">{f.value || '—'}</span>
                                                            {f.value && (
                                                                <button type="button" onClick={() => navigator.clipboard.writeText(f.value)}
                                                                    className="shrink-0 text-gray-600 hover:text-emerald-400 transition-colors" title="Copy">
                                                                    <IonIcon name="copy-outline" className="text-[13px]" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Payment Screenshot</label>
                                        <label className="flex flex-col items-center justify-center gap-2 w-full border border-dashed border-gray-700/60 rounded-xl py-5 cursor-pointer hover:border-gray-600 hover:bg-white/[0.02] transition-all">
                                            {buyScreenshot ? (
                                                <><IonIcon name="image-outline" className="text-emerald-400 text-xl" /><span className="text-[10px] text-emerald-400 font-bold">{buyScreenshot.name}</span><span className="text-[9px] text-gray-600">Tap to change</span></>
                                            ) : (
                                                <><IonIcon name="cloud-upload-outline" className="text-gray-600 text-2xl" /><span className="text-[10px] text-gray-500 font-semibold">Tap to upload screenshot</span></>
                                            )}
                                            <input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0] || null; buyScreenshotRef.current = file; setBuyScreenshot(file); setBuyError(null); }} />
                                        </label>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Transaction ID</label>
                                        <input type="text" value={buyTxId} onChange={e => { setBuyTxId(e.target.value); setBuyError(null); }} placeholder="e.g. TXN123456789"
                                            className="w-full bg-[#030303] border border-gray-700/50 rounded-lg px-3 py-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-[#0b0b0b] transition-all" />
                                    </div>
                                    {buyError && (
                                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                            <IonIcon name="alert-circle-outline" className="text-red-400 text-sm shrink-0" />
                                            <p className="text-[10px] font-bold text-red-400">{buyError}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0 flex gap-2">
                                    <button onClick={closeBuyPopup} className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">Cancel</button>
                                    <button onClick={handleBuySubmit} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5">
                                        <IonIcon name="paper-plane-outline" className="text-xs" />Submit
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Buy Blocked Popup ── */}
            {buyBlockedPopup && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setBuyBlockedPopup(false)} />
                    <div className="relative w-full sm:max-w-xs bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <IonIcon name="time-outline" className="text-amber-400 text-2xl" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">Locked · Pending Transaction</h3>
                            <p className="text-[11px] text-gray-500 leading-relaxed">You already have a pending transaction. Cancel or complete it before buying from another ad.</p>
                            {buyBlockedTx && (
                                <div className="mt-3 bg-[#0a0a0a] border border-gray-800/70 rounded-lg px-3 py-2 text-left">
                                    <p className="text-[9px] text-gray-600 uppercase tracking-widest font-bold mb-0.5">Pending transaction</p>
                                    <p className="text-[10px] text-gray-300 font-bold truncate">{buyBlockedTx.ad_name || `Ad #${buyBlockedTx.ad_id}`}</p>
                                    <p className="text-[9px] text-gray-500 mt-0.5">ID: {buyBlockedTx.id} · Amount: {Number(buyBlockedTx.amount || 0).toLocaleString()}{buyBlockedTx.tx_id ? ' · Submitted, awaiting seller' : ' · Not submitted'}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 w-full">
                            <button onClick={() => { setBuyBlockedPopup(false); setBuyBlockedTx(null); }}
                                className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                OK
                            </button>
                            {buyBlockedTx && !buyBlockedTx.tx_id && (
                                <button
                                    onClick={async () => {
                                        if (!buyBlockedTx) return;
                                        setCancellingBlockedTx(true);
                                        try {
                                            await fetch(`${API_URL}/p2p-ads/transactions/${buyBlockedTx.id}/cancel`, {
                                                method: 'POST',
                                                headers: { Authorization: `Bearer ${getToken()}` },
                                            });
                                            setBuyBlockedPopup(false);
                                            setBuyBlockedTx(null);
                                            fetchTransactions('all');
                                            fetchAds(true);
                                        } finally {
                                            setCancellingBlockedTx(false);
                                        }
                                    }}
                                    disabled={cancellingBlockedTx}
                                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95"
                                >
                                    {cancellingBlockedTx ? 'Cancelling…' : 'Cancel Pending'}
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    const tx = buyBlockedTx;
                                    const matchPayment = tx ? payments.find(p => String(p.id) === String(tx.ad_id)) : undefined;
                                    setBuyBlockedPopup(false);
                                    setBuyBlockedTx(null);
                                    setCurrencyFilter('all');
                                    setCountryFilter('');
                                    setTransactionFilter('pending');
                                    if (tx && matchPayment) {
                                        // Open the buyer-view popup directly so the user can act on it
                                        // even if the pending tab's filtering logic hides the card.
                                        openBuyerViewPopup(tx, matchPayment);
                                    }
                                }}
                                className="flex-1 py-2.5 bg-white text-black font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                View Pending
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Full-Screen Image Zoom Viewer ── */}
            {zoomImageUrl && (
                <div
                    className="theme-preserve-dark proof-zoom-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
                    onClick={closeZoom}
                >
                    {/* Controls bar */}
                    <div
                        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 border border-white/10 rounded-2xl px-3 py-2 backdrop-blur-md z-10"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setZoomScale(s => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white transition-all active:scale-90"
                            title="Zoom out"
                        >
                            <IonIcon name="remove-outline" className="text-base" />
                        </button>
                        <span className="text-[11px] font-black text-white min-w-[42px] text-center select-none">
                            {Math.round(zoomScale * 100)}%
                        </span>
                        <button
                            type="button"
                            onClick={() => setZoomScale(s => Math.min(5, parseFloat((s + 0.25).toFixed(2))))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white transition-all active:scale-90"
                            title="Zoom in"
                        >
                            <IonIcon name="add-outline" className="text-base" />
                        </button>
                        <div className="w-px h-5 bg-white/10 mx-1" />
                        <button
                            type="button"
                            onClick={() => setZoomScale(1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white transition-all active:scale-90"
                            title="Reset zoom"
                        >
                            <IonIcon name="scan-outline" className="text-base" />
                        </button>
                        <div className="w-px h-5 bg-white/10 mx-1" />
                        <button
                            type="button"
                            onClick={closeZoom}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-red-500/30 text-gray-400 hover:text-white transition-all active:scale-90"
                            title="Close"
                        >
                            <IonIcon name="close-outline" className="text-base" />
                        </button>
                    </div>

                    {/* Scrollable image container */}
                    <div
                        className="w-full h-full overflow-auto flex items-center justify-center p-16"
                        onClick={e => e.stopPropagation()}
                    >
                        <img
                            src={zoomImageUrl}
                            alt="Proof zoom"
                            style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
                            className="proof-zoom-image max-w-full max-h-full object-contain rounded-lg select-none"
                            draggable={false}
                        />
                    </div>

                    {/* Tap outside hint */}
                    <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-white/20 font-bold uppercase tracking-widest pointer-events-none select-none">
                        Tap outside to close
                    </p>
                </div>
            )}

            {/* ── Report Popup ── */}
            {chatPopup && (
                <OrderChatPopup
                    participantId={chatPopup.userId}
                    participantName={chatPopup.name}
                    roleLabel={chatPopup.roleLabel}
                    orderLabel={chatPopup.orderLabel}
                    onClose={() => setChatPopup(null)}
                />
            )}

            {reportTarget && (() => {
                const txRole  = getTxRole(reportTarget.tx);
                const reasons = txRole === 'buyer' ? BUYER_REPORT_REASONS : SELLER_REPORT_REASONS;
                return (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setReportTarget(null)} />
                    <div className="relative w-full sm:max-w-sm bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                    <IonIcon name="flag-outline" className="text-red-400 text-sm" />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">Report Transaction</h2>
                                    <p className="text-[9px] text-gray-600 mt-0.5">
                                        {reportTarget.payment.name} · Order #{reportTarget.tx.id}
                                        <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${txRole === 'buyer' ? 'bg-sky-500/10 text-sky-400' : 'bg-violet-500/10 text-violet-400'}`}>
                                            {txRole === 'buyer' ? 'Buyer' : 'Seller'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setReportTarget(null)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>
                        {/* Body */}
                        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
                            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-3">Select a reason</p>
                            {reasons.map(r => (
                                <button key={r} type="button"
                                    onClick={() => setReportReason(r)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${reportReason === r ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/[0.03] border-gray-800 text-gray-400 hover:bg-white/[0.06] hover:text-white'}`}>
                                    <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${reportReason === r ? 'border-red-400' : 'border-gray-600'}`}>
                                        {reportReason === r && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                                    </div>
                                    <span className="text-[11px] font-semibold">{r}</span>
                                </button>
                            ))}
                            {reportReason === 'Other' && (
                                <div className="mt-2">
                                    <textarea
                                        value={reportCustomReason}
                                        onChange={e => { setReportCustomReason(e.target.value); setReportError(null); }}
                                        placeholder="Describe the issue…"
                                        rows={3}
                                        className="w-full bg-[#030303] border border-gray-700/50 rounded-lg px-3 py-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-[#0b0b0b] transition-all resize-none"
                                    />
                                </div>
                            )}
                            {reportError && (
                                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                    <IonIcon name="alert-circle-outline" className="text-red-400 text-sm shrink-0" />
                                    <p className="text-[10px] font-bold text-red-400">{reportError}</p>
                                </div>
                            )}
                        </div>
                        {/* Footer */}
                        <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0 flex gap-2">
                            <button type="button" onClick={() => setReportTarget(null)}
                                className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                Cancel
                            </button>
                            <button type="button" onClick={submitReport} disabled={reportSubmitting}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                <IonIcon name="flag-outline" className="text-xs" />
                                {reportSubmitting ? 'Submitting…' : 'Submit Report'}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* ── No Approval Popup ── */}
            {showNoApproval && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setShowNoApproval(false)} />
                    <div className="relative w-full sm:max-w-sm bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                            <IonIcon name="lock-closed-outline" className="text-amber-400 text-xl" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">Approval Required</h3>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                You need admin approval before posting an ad.<br />Please send a request and wait for it to be verified.
                            </p>
                        </div>
                        <div className="flex gap-2 w-full">
                            <button onClick={() => setShowNoApproval(false)}
                                className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                Cancel
                            </button>
                            <button onClick={() => { setShowNoApproval(false); onGoRequest(); }}
                                className="flex-1 py-2.5 bg-white hover:bg-gray-100 text-black font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg">
                                <IonIcon name="paper-plane-outline" className="text-xs" />
                                Send Request
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Catalog Modal ── */}
            {showCatalog && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setShowCatalog(false)} />
                    <div className="relative w-full sm:max-w-xl bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div>
                                <h2 className="text-xs font-bold text-white">Select Payment Method</h2>
                                <p className="text-[9px] text-gray-600 mt-0.5">Only admin-approved methods can be selected</p>
                            </div>
                            <button onClick={() => setShowCatalog(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>

                        {/* Category tabs */}
                        <div className="border-b border-gray-800 px-3 shrink-0">
                            <div className="flex gap-1 overflow-x-auto scrollbar-hide py-2">
                                {CATEGORIES.map(cat => (
                                    <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeCategory === cat ? 'bg-white text-black' : 'bg-white/[0.05] text-gray-500 hover:text-white hover:bg-white/[0.08]'}`}>
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Method grid */}
                        <div className="overflow-y-auto flex-1 p-4">
                            {loadingAdmin ? (
                                <div className="flex items-center justify-center py-12 opacity-40">
                                    <IonIcon name="reload-outline" className="animate-spin text-2xl text-gray-500" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2">
                                    {PAYMENT_CATALOG[activeCategory].map(entry => {
                                        const admin = findAdmin(entry);
                                        const isApproved = !!admin;
                                        const alreadyAdded = payments.some(p => p.isOwn && p.catalogId === entry.id);
                                        return (
                                            <button key={entry.id} type="button"
                                                onClick={() => (isApproved && !alreadyAdded) ? openForm(entry) : undefined}
                                                disabled={!isApproved || alreadyAdded}
                                                title={alreadyAdded ? 'You already have an ad for this payment method.' : undefined}
                                                className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                                                    alreadyAdded
                                                        ? 'border-emerald-400/40 bg-emerald-400/[0.07] cursor-not-allowed'
                                                        : isApproved
                                                            ? 'border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/40 hover:bg-emerald-500/[0.08] active:scale-95 cursor-pointer'
                                                            : 'border-gray-800/30 bg-transparent opacity-25 cursor-not-allowed'
                                                }`}>
                                                {alreadyAdded && (
                                                    <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 flex items-center justify-center">
                                                        <IonIcon name="checkmark" className="text-black text-[8px]" />
                                                    </div>
                                                )}
                                                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden">
                                                    <PaymentLogo name={entry.name} svgFile={entry.svgFile} clearbitDomain={entry.clearbitDomain} />
                                                </div>
                                                <span className={`text-[8px] font-bold text-center leading-tight ${alreadyAdded ? 'text-emerald-400' : isApproved ? 'text-gray-300' : 'text-gray-600'}`}>
                                                    {entry.name}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Form Modal ── */}
            {formEntry && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={closeForm} />
                    <div className="relative w-full sm:max-w-md bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    <PaymentLogo name={formEntry.name} svgFile={formEntry.svgFile} clearbitDomain={formEntry.clearbitDomain} />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white">{formEntry.name}</h2>
                                    <p className="text-[9px] text-gray-600">{editingId ? 'Edit details' : 'Add payment method'}</p>
                                </div>
                            </div>
                            <button onClick={closeForm} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-base" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

                            {/* ── Country (Bank category only) ── */}
                            {isBank && (
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                        Country <span className="text-red-400">*</span>
                                    </label>
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => setShowCountryMenu(s => !s)}
                                            className="w-full flex items-center justify-between gap-2 bg-[#030303] border border-gray-700/50 rounded-lg px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b0b0b] transition-all"
                                        >
                                            <span className="flex items-center gap-2 min-w-0">
                                                {selectedCountry ? (
                                                    <>
                                                        <img src={selectedCountry.flagSvg} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0" />
                                                        <span className="truncate">{selectedCountry.name}</span>
                                                    </>
                                                ) : country ? (
                                                    <span className="truncate">{country}</span>
                                                ) : (
                                                    <span className="text-gray-500">{countries.length ? 'Select country' : 'Loading countries…'}</span>
                                                )}
                                            </span>
                                            <IonIcon name="chevron-down-outline" className="text-gray-500 text-[10px] shrink-0" />
                                        </button>
                                        {showCountryMenu && (
                                            <div className="mt-2 bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden">
                                                <div className="p-2 border-b border-gray-800">
                                                    <input
                                                        type="text"
                                                        value={countrySearch}
                                                        onChange={e => setCountrySearch(e.target.value)}
                                                        placeholder="Search…"
                                                        className="w-full bg-[#030303] border border-gray-700/50 rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                </div>
                                                <div className="max-h-56 overflow-y-auto">
                                                    {countries
                                                        .filter(c => !countrySearch.trim() || c.name.toLowerCase().includes(countrySearch.trim().toLowerCase()))
                                                        .map(c => (
                                                            <button
                                                                key={c.cca2 || c.name}
                                                                type="button"
                                                                onClick={() => { setCountry(c.name); setShowCountryMenu(false); setCountrySearch(''); }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                                                            >
                                                                <img src={c.flagSvg} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0" />
                                                                <span className="text-[11px] font-semibold text-white truncate">{c.name}</span>
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── Admin fields (no heading) ── */}
                            {formAdmin && formAdmin.fields.length > 0 && (
                                <div className="space-y-3">
                                    {formAdmin.fields.map(field => (
                                        <div key={field.key}>
                                            <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                                {field.label}
                                                <span className="text-red-400 ml-1">*</span>
                                                {field.locked && <span className="ml-1.5 text-gray-700 normal-case tracking-normal">· locked</span>}
                                            </label>
                                            <input
                                                type={field.type || 'text'}
                                                value={adminFieldVals[field.key] ?? field.defaultValue ?? ''}
                                                onChange={e => !field.locked && setAdminFieldVals(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                disabled={!!field.locked}
                                                readOnly={!!field.locked}
                                                placeholder={field.placeholder || field.label}
                                                className={`w-full border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-white/20 transition-all ${
                                                    field.locked
                                                        ? 'bg-[#030303] border-gray-800 text-gray-600 cursor-not-allowed'
                                                        : 'bg-[#030303] border-gray-700/50 text-white hover:bg-[#0b0b0b]'
                                                }`}
                                            />
                                        </div>
                                    ))}
                                    <div className="border-t border-gray-800/60" />
                                </div>
                            )}

                            {/* ── Your Settings ── */}
                            <div className="space-y-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-600">Your Settings</p>

                                {/* Currency + Rate — single row */}
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                        Rate <span className="text-red-400">*</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {/* Currency dropdown */}
                                        <div className="relative shrink-0">
                                            <select
                                                value={cryptoCurrency}
                                                onChange={e => setCryptoCurrency(e.target.value as 'USD' | 'USDT' | 'LKR')}
                                                className="appearance-none bg-[#030303] border border-gray-700/50 rounded-lg pl-3 pr-7 py-2 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer hover:bg-[#0b0b0b] transition-all"
                                            >
                                                {(isCrypto ? ['USD', 'USDT'] : ['USD', 'LKR', 'USDT']).map(cur => (
                                                    <option key={cur} value={cur}>{cur}</option>
                                                ))}
                                            </select>
                                            <IonIcon name="chevron-down-outline" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]" />
                                        </div>
                                        {/* Rate input */}
                                        <div className="flex items-center flex-1 bg-[#030303] border border-gray-700/50 rounded-lg overflow-hidden">
                                            <input
                                                type="number"
                                                value={lkrRate}
                                                onChange={e => setLkrRate(e.target.value)}
                                                placeholder="330"
                                                className="flex-1 bg-transparent px-3 py-2 text-xs font-bold text-white focus:outline-none min-w-0"
                                            />
                                            <span className="pr-3 text-[9px] font-black text-gray-500 shrink-0">R</span>
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-gray-700 mt-1">1 {cryptoCurrency} = {lkrRate || '—'} R</p>
                                </div>

                                {/* Min + Max same row */}
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase tracking-wider w-32">
                                            Minimum Amount (R) <span className="text-red-400">*</span>
                                        </label>
                                        <label className="text-[9px] font-bold text-gray-600 uppercase tracking-wider w-32">
                                            Maximum Amount (R)
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-32">
                                            <div className={`flex items-center bg-[#030303] border rounded-lg overflow-hidden ${minErr ? 'border-red-500/60' : 'border-gray-700/50'}`}>
                                                <input
                                                    type="number"
                                                    value={minAmount}
                                                    onChange={e => setMinAmount(e.target.value)}
                                                    placeholder="e.g. 10"
                                                    className={`flex-1 bg-transparent px-2.5 py-2 text-xs font-semibold focus:outline-none min-w-0 ${minErr ? 'text-red-400' : 'text-white'}`}
                                                />
                                                <span className="pr-2 text-[9px] font-black text-gray-500 shrink-0">R</span>
                                            </div>
                                            {minErr && <p className="text-[8px] text-red-400 font-semibold mt-1">Exceeds wallet balance</p>}
                                        </div>
                                        <div className="w-32">
                                            <div className={`flex items-center bg-[#030303] border rounded-lg overflow-hidden ${maxErr ? 'border-red-500/60' : 'border-gray-700/50'}`}>
                                                <input
                                                    type="number"
                                                    value={maxAmount}
                                                    onChange={e => setMaxAmount(e.target.value)}
                                                    placeholder={walletBalance.toFixed(2)}
                                                    className={`flex-1 bg-transparent px-2.5 py-2 text-xs font-semibold focus:outline-none min-w-0 ${maxErr ? 'text-red-400' : 'text-white'}`}
                                                />
                                                <span className="pr-2 text-[9px] font-black text-gray-500 shrink-0">R</span>
                                            </div>
                                            {maxErr && <p className="text-[8px] text-red-400 font-semibold mt-1">Exceeds wallet balance</p>}
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-gray-700 mt-1">Wallet balance: R {walletBalance.toFixed(2)}</p>
                                </div>

                                {/* Release Time — single box, clickable unit */}
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                        Coin Release Time
                                    </label>
                                    <div className="flex items-center bg-[#030303] border border-gray-700/50 rounded-lg overflow-hidden">
                                        <input
                                            type="number"
                                            min="0"
                                            value={releaseValue}
                                            onChange={e => setReleaseValue(e.target.value)}
                                            placeholder="0"
                                            className="flex-1 bg-transparent px-3 py-2 text-xs font-bold text-white focus:outline-none min-w-0"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setReleaseUnit(u => u === 'h' ? 'min' : u === 'min' ? 's' : 'h')}
                                            className="px-3 py-2 text-[10px] font-black text-emerald-400 hover:text-white hover:bg-white/[0.06] transition-all shrink-0 border-l border-gray-700/50 min-w-[38px] text-center"
                                        >
                                            {releaseUnit}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-gray-700 mt-1">Tap the unit to switch between h · min · s</p>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                        Description
                                    </label>
                                    <textarea
                                        value={adDescription}
                                        onChange={e => setAdDescription(e.target.value)}
                                        placeholder="Add any instructions or details for the buyer..."
                                        rows={3}
                                        className="w-full bg-[#030303] border border-gray-700/50 rounded-lg px-3 py-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-[#0b0b0b] transition-all resize-none"
                                    />
                                </div>
                            </div>

                            {formError && (
                                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                    <IonIcon name="alert-circle-outline" className="text-red-400 text-sm shrink-0" />
                                    <p className="text-[10px] font-bold text-red-400">{formError}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-5 pt-3 border-t border-gray-800 shrink-0 flex gap-2">
                            <button onClick={closeForm}
                                className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 py-2.5 bg-white hover:bg-gray-100 disabled:opacity-60 text-black font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg">
                                <IonIcon name={saving ? 'reload-outline' : 'checkmark-outline'} className={`text-xs ${saving ? 'animate-spin' : ''}`} />
                                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Topup component ─────────────────────────────────────────────────────
export default function Topup() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('buy');
    const [activeTab, setActiveTab] = useState<'topup' | 'pending' | 'complete'>('topup');
    const [amount, setAmount] = useState('0');
    const [paymentMethod, setPaymentMethod] = useState('bank');
    const [balance, setBalance] = useState(0);

    useEffect(() => {
        authService.getProfile()
            .then(p => setBalance(parseFloat(p.wallet_balance) || 0))
            .catch(() => {});
    }, []);

    const handlePayment = () => {
        if (paymentMethod === 'bank') {
            router.push(`/dashboard/wallet/topup/bank-transfer?amount=${amount}`);
        } else {
            alert("Redirecting to payment gateway...");
        }
    };

    if (step === 'select') {
        return (
            <div className="pb-10 relative min-h-screen">
                <div className="mb-4">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                        <IonIcon name="chevron-back-outline" className="text-xl" />
                        <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                    </button>
                </div>
                <h1 className="text-2xl font-bold mb-2 text-white">Wallet</h1>
                <p className="text-gray-500 text-sm mb-8">What would you like to do?</p>
                <div className="grid grid-cols-1 gap-4 max-w-md">
                    <button onClick={() => setStep('buy')} className="w-full text-left bg-[#070707] border border-gray-800 hover:border-gray-600 rounded-2xl p-6 transition-all active:scale-[0.98] group">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                <IonIcon name="cart-outline" className="text-white/75 text-2xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-white mb-0.5">Buy</h3>
                                <p className="text-xs text-gray-500">Purchase coins with your preferred method</p>
                            </div>
                            <IonIcon name="chevron-forward-outline" className="text-gray-400 group-hover:text-white text-xl shrink-0 transition-colors" />
                        </div>
                    </button>
                    <div className="bg-[#070707] border border-gray-800 rounded-2xl p-6 opacity-50 cursor-not-allowed select-none">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center shrink-0">
                                <IonIcon name="pricetag-outline" className="text-white/75 text-2xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-white mb-0.5">Sell</h3>
                                <p className="text-xs text-gray-500">Sell coins — coming soon</p>
                            </div>
                            <IonIcon name="chevron-forward-outline" className="text-gray-600 text-xl shrink-0" />
                        </div>
                    </div>
                    <button onClick={() => setStep('topup')} className="w-full text-left bg-[#070707] border border-gray-800 hover:border-gray-600 rounded-2xl p-6 transition-all active:scale-[0.98] group">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                <IonIcon name="add-circle-outline" className="text-white/75 text-2xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-white mb-0.5">Top Up</h3>
                                <p className="text-xs text-gray-500">Recharge your wallet with Rupier coins</p>
                            </div>
                            <IonIcon name="chevron-forward-outline" className="text-gray-400 group-hover:text-white text-xl shrink-0 transition-colors" />
                        </div>
                    </button>
                    <button onClick={() => router.push('/dashboard/wallet/request')} className="w-full text-left bg-[#070707] border border-gray-800 hover:border-gray-600 rounded-2xl p-6 transition-all active:scale-[0.98] group">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                <IonIcon name="paper-plane-outline" className="text-white/75 text-2xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-white mb-0.5">Request</h3>
                                <p className="text-xs text-gray-500">Send a coin request for verification</p>
                            </div>
                            <IonIcon name="chevron-forward-outline" className="text-gray-400 group-hover:text-white text-xl shrink-0 transition-colors" />
                        </div>
                    </button>
                </div>
                <div className="h-20 md:hidden" />
            </div>
        );
    }

    if (step === 'buy') return (
        <BuyScreen
            onBack={() => router.push('/dashboard/wallet')}
            walletBalance={balance}
            onGoRequest={() => router.push('/dashboard/wallet/request')}
            onGoTopup={() => setStep('topup')}
            onGoSell={() => router.push('/dashboard/wallet/sell')}
        />
    );

    // ── Top Up form ───────────────────────────────────────────────────────────
    return (
        <div className="pb-10 relative min-h-screen">
            <div className="mb-4">
                <button onClick={() => setStep('buy')} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
                <button
                    onClick={() => setStep('buy')}
                    className="flex items-center gap-1.5 font-bold rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest transition-all bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 hover:text-white"
                >
                    <IonIcon name="cash-outline" className="text-xs" />
                    Buy Coins
                </button>
                <button
                    onClick={() => router.push('/dashboard/wallet/sell')}
                    className="flex items-center gap-1.5 font-bold rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest transition-all bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 hover:text-white"
                >
                    <IonIcon name="cash-outline" className="text-xs" />
                    Sell Coins
                </button>
                <button
                    disabled
                    className="flex items-center gap-1.5 font-black rounded-lg px-3 py-1.5 text-[9px] uppercase tracking-widest shadow-md bg-white text-black"
                >
                    <IonIcon name="add-circle-outline" className="text-xs" />
                    Top Up
                </button>
            </div>
            <h1 className="text-2xl font-bold mb-6 text-white">Top Up</h1>
            <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                        {[{ key: 'topup', label: 'Topup Coins' }, { key: 'pending', label: 'Pending' }, { key: 'complete', label: 'Complete' }].map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                                className={`pb-3 pt-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === tab.key ? 'text-white border-white' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-6 md:p-8 min-h-[400px]">
                    {activeTab === 'topup' && (
                        <div className="max-w-md mx-auto">
                            <h4 className="text-lg font-bold text-white mb-6 text-center">Topup Coins</h4>
                            <div className="bg-[#070707] border border-gray-700 rounded-xl p-5 mb-6 flex flex-col items-center justify-center">
                                <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-3 text-center">Total Wallet Balance</p>
                                <h2 className="text-3xl font-bold text-white">{balance.toFixed(2)}</h2>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-center text-gray-400 text-xs font-semibold mb-3">Enter Coin Amount</label>
                                    <input type="text" value={amount} onChange={e => setAmount(e.target.value)}
                                        className="w-full bg-[#030303] border border-gray-700 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner"
                                        placeholder="1000" />
                                </div>
                                <div className="space-y-4">
                                    <p className="text-center text-gray-400 text-xs font-semibold mb-2">Select Payment Method</p>
                                    <div className="space-y-3 max-w-xs mx-auto">
                                        {[{ id: 'bank', label: 'Direct Bank Transfer' }, { id: 'payeer', label: 'Pay with Payeer' }, { id: 'paypal', label: 'Pay with Paypal' }].map(m => (
                                            <label key={m.id} className="flex items-center gap-3 cursor-pointer group bg-white/5 p-3 rounded-xl border border-transparent hover:border-white/10 transition-all">
                                                <div className="relative">
                                                    <input type="radio" name="payment" checked={paymentMethod === m.id} onChange={() => setPaymentMethod(m.id)} className="sr-only" />
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${paymentMethod === m.id ? 'border-white' : 'border-gray-600'}`}>
                                                        {paymentMethod === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                                    </div>
                                                </div>
                                                <span className={`text-sm font-semibold transition-colors ${paymentMethod === m.id ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>{m.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button onClick={() => setStep('buy')} className="flex-1 py-3 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full transition-all active:scale-95 text-xs uppercase">Cancel</button>
                                    <button onClick={handlePayment} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg text-xs uppercase">Make Payment</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'pending' && (
                        <div className="py-16 text-center">
                            <IonIcon name="time-outline" className="text-3xl text-gray-700 mb-4" />
                            <p className="text-gray-500 text-sm font-medium">No Pending Topups Found</p>
                        </div>
                    )}
                    {activeTab === 'complete' && (
                        <div className="py-16 text-center">
                            <IonIcon name="checkmark-circle-outline" className="text-3xl text-gray-700 mb-4" />
                            <p className="text-gray-500 text-sm font-medium">No Completed Transactions</p>
                        </div>
                    )}
                </div>
            </div>
            <div className="h-20 md:hidden" />
        </div>
    );
}
