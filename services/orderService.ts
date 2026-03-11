
const isClient = typeof window !== 'undefined';
const API_URL = process.env.NEXT_PUBLIC_API_URL ||
    (isClient && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:5000/api');

const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const orderService = {
    // Create order (Buy)
    createOrder: async (itemId: number) => {
        try {
            const response = await fetch(`${API_URL}/orders/create`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ item_id: itemId })
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
                headers: getAuthHeaders()
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
                headers: getAuthHeaders()
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
    }
};
