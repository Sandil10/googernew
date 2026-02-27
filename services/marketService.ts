
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

export const marketService = {
    // Fetch market items
    getItems: async (filters: any = {}) => {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`${API_URL}/market?${queryParams}`, {
                method: 'GET',
                // Optional auth header if we want to support personalized views later, 
                // but getItems is public mostly. However, logged in users might see different things?
                // The backend controller doesn't enforce auth for getItems, but let's send token if available just in case.
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message + (data.error ? `: ${data.error}` : '') || 'Failed to fetch items');
            return data.data;
        } catch (error) {
            console.error('Error fetching market items:', error);
            throw error;
        }
    },

    // Create a new item
    createItem: async (itemData: any) => {
        try {
            const isFormData = itemData instanceof FormData;
            const headers = getAuthHeaders();

            if (isFormData) {
                // Let browser set Content-Type for FormData (multipart/form-data)
                // @ts-ignore
                delete headers['Content-Type'];
            }

            const response = await fetch(`${API_URL}/market/create`, {
                method: 'POST',
                headers: headers,
                body: isFormData ? itemData : JSON.stringify(itemData),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message + (data.error ? `: ${data.error}` : '') || 'Failed to create item');
            return data.data;
        } catch (error) {
            console.error('Error creating market item:', error);
            throw error;
        }
    },

    // Get item by ID
    getItemById: async (id: number) => {
        try {
            const response = await fetch(`${API_URL}/market/${id}`, {
                method: 'GET',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch item');
            return data.data;
        } catch (error) {
            console.error('Error fetching market item:', error);
            throw error;
        }
    },

    // Update an item
    updateItem: async (id: number, itemData: any) => {
        try {
            const isFormData = itemData instanceof FormData;
            const headers = getAuthHeaders();

            if (isFormData) {
                // @ts-ignore
                delete headers['Content-Type'];
            }

            const response = await fetch(`${API_URL}/market/${id}`, {
                method: 'PUT',
                headers: headers,
                body: isFormData ? itemData : JSON.stringify(itemData),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update item');
            return data.data;
        } catch (error) {
            console.error('Error updating market item:', error);
            throw error;
        }
    },

    // Delete an item
    deleteItem: async (id: number) => {
        try {
            const response = await fetch(`${API_URL}/market/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to delete item');
            return true;
        } catch (error) {
            console.error('Error deleting market item:', error);
            throw error;
        }
    }
};
