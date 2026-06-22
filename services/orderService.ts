
import { API_URL } from './apiConfig';

const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? (window.sessionStorage.getItem('token') || window.localStorage.getItem('token')) : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const orderService = {
    getBadgeCounts: async () => {
        try {
            const response = await fetch(`${API_URL}/orders/badge-counts`, {
                method: 'GET',
                headers: getAuthHeaders(),
                cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch order badge counts');
            return data.data;
        } catch (error) {
            console.error('Error fetching order badge counts:', error);
            throw error;
        }
    },

    // Create order (Buy)
    createOrder: async (orderData: {
        item_id: number,
        quantity: number,
        size?: string | null,
        color?: string | null,
        variant_index?: number | null,
        total_price: number,
        shipping_address?: string,
        wallet_transfer_id?: string,
        payment_method?: string,
        reseller_ref?: string | null,
        resell_commission_percentage?: number
    }) => {
        try {
            const response = await fetch(`${API_URL}/orders/create`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(orderData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create order');
            return data.data;
        } catch (error) {
            console.error('Error creating order:', error);
            throw error;
        }
    },

    // Get orders as a buyer
    getBuyerOrders: async (filters: any = {}) => {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`${API_URL}/orders/buyer?${queryParams}`, {
                method: 'GET',
                headers: getAuthHeaders(),
                cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch orders');
            return data.data;
        } catch (error) {
            console.error('Error fetching buyer orders:', error);
            throw error;
        }
    },

    // Get orders as a seller
    getSellerOrders: async (filters: any = {}) => {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`${API_URL}/orders/seller?${queryParams}`, {
                method: 'GET',
                headers: getAuthHeaders(),
                cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch orders');
            return data.data;
        } catch (error) {
            console.error('Error fetching seller orders:', error);
            throw error;
        }
    },

    // Update status (Seller action)
    updateStatus: async (orderId: number, status: string) => {
        try {
            const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update order status');
            return data.data;
        } catch (error) {
            console.error('Error updating status:', error);
            throw error;
        }
    },
    
    // Create bulk order (Grouped items)
    createBulkOrder: async (orderData: {
        items: Array<{
            item_id: number;
            quantity: number;
            size?: string | null;
            color?: string | null;
            variant_index?: number | null;
            total_price: number;
            reseller_ref?: string | null;
            resell_commission_percentage?: number;
        }>,
        shipping_address: string,
        payment_method: string,
        total_order_price: number,
        wallet_transfer_id?: string
    }) => {
        try {
            const response = await fetch(`${API_URL}/orders/create-bulk`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(orderData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create bulk order');
            return data.data;
        } catch (error) {
            console.error('Error creating bulk order:', error);
            throw error;
        }
    },

    // Cancel entire order group
    cancelOrderGroup: async (orderNumber: string) => {
        try {
            const response = await fetch(`${API_URL}/orders/group/${orderNumber}/cancel`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to cancel order group');
            return data.data;
        } catch (error) {
            console.error('Error cancelling order group:', error);
            throw error;
        }
    },
    
    // Update entire order group status (Seller action)
    updateOrderGroupStatus: async (orderNumber: string, status: string) => {
        try {
            const response = await fetch(`${API_URL}/orders/group/${orderNumber}/status`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update order group status');
            return data.data;
        } catch (error) {
            console.error('Error updating order group status:', error);
            throw error;
        }
    },

    // Submit report for an order
    submitReport: async (orderId: number, reportData: { reason: string, custom_text: string, side: 'buyer' | 'seller' }) => {
        try {
            const response = await fetch(`${API_URL}/orders/${orderId}/report`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(reportData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to submit report');
            return data.success;
        } catch (error) {
            console.error('Error submitting report:', error);
            throw error;
        }
    }
};
