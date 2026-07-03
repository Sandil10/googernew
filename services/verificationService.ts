const isClient = typeof window !== 'undefined';
import { API_URL } from './apiConfig';

const getToken = () => (isClient ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null);
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

export type VerificationStatus = 'None' | 'Under Review' | 'Verified' | 'Rejected';

export type VerificationRecord = {
    id: number;
    status: VerificationStatus;
    rejection_reason: string | null;
    full_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    date_of_birth: string | null;
    country: string | null;
    document_type: string;
    id_number: string;
    doc_front_url: string | null;
    doc_back_url: string | null;
    official_website: string | null;
    social_links: string | null;
    news_links: string | null;
    vat_number: string | null;
    business_website: string | null;
    submitted_at: string;
    reviewed_at: string | null;
};

export const verificationService = {
    getStatus: async (): Promise<VerificationRecord | null> => {
        const res = await fetch(`${API_URL}/verification/status`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to fetch verification status');
        return data.verification;
    },

    submit: async (formData: FormData): Promise<{ message: string }> => {
        const res = await fetch(`${API_URL}/verification/submit`, {
            method: 'POST',
            headers: authHeaders(),
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Submission failed');
        return data;
    },

    adminGetAll: async (status?: string): Promise<any[]> => {
        const qs = status && status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
        const res = await fetch(`${API_URL}/verification/admin/all${qs}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to fetch');
        return data.verifications || [];
    },

    adminReview: async (id: number, action: 'approve' | 'reject', rejectionReason?: string): Promise<void> => {
        const res = await fetch(`${API_URL}/verification/admin/${id}/review`, {
            method: 'PUT',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, rejectionReason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Review failed');
    },
};
