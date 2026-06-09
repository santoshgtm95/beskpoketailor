/**
 * db.js – REST API Gateway (SQLite backend adapter)
 * Beskpoke Tailor Shop · Data layer
 */

const API_BASE = window.location.origin.startsWith('file://') ? 'http://localhost:3000/api' : '/api';

// Display the offline warning overlay
function showConnectionError() {
  const banner = document.getElementById('connection-error-banner');
  if (banner) {
    banner.style.display = 'flex';
  }
}

// Helper to make AJAX fetch requests
async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  if (!options.headers) options.headers = {};
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    options.headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    console.error('API Network connection failed:', netErr);
    showConnectionError();
    throw new Error('Network connection failed. Please ensure the backend server is running.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `API Error: ${res.statusText}`);
  }

  // Handle empty or JSON responses
  return await res.json().catch(() => ({}));
}

// ── Exported DB API ────────────────────────────────────────────
const DB = {
  init: async () => {
    try {
      await apiRequest('/status');
    } catch (err) {
      console.warn("Could not connect to SQLite backend server on startup.");
      throw err;
    }
  },

  // Customers
  customers: {
    getAll: ()        => apiRequest('/customers'),
    get:    (id)      => apiRequest(`/customers/${id}`),
    add:    (r)       => apiRequest('/customers', { method: 'POST', body: r }),
    put:    (r)       => apiRequest(`/customers/${r.CustomerID}`, { method: 'PUT', body: r }),
    delete: (id)      => apiRequest(`/customers/${id}`, { method: 'DELETE' }),
  },

  // Categories
  categories: {
    getAll: ()        => apiRequest('/categories'),
    get:    (id)      => apiRequest(`/categories/${id}`),
    add:    (r)       => apiRequest('/categories', { method: 'POST', body: r }),
    put:    (r)       => apiRequest(`/categories/${r.CategoryID}`, { method: 'PUT', body: r }),
    delete: (id)      => apiRequest(`/categories/${id}`, { method: 'DELETE' }),
  },

  // Subcategories
  subcategories: {
    getAll: ()         => apiRequest('/subcategories'),
    getByCategory: async (catId) => {
      const all = await apiRequest('/subcategories');
      return all.filter(s => s.CategoryID === catId);
    },
    get:    (id)       => apiRequest(`/subcategories/${id}`),
    add:    (r)        => apiRequest('/subcategories', { method: 'POST', body: r }),
    put:    (r)        => apiRequest(`/subcategories/${r.SubcatID}`, { method: 'PUT', body: r }),
    delete: (id)       => apiRequest(`/subcategories/${id}`, { method: 'DELETE' }),
  },

  // Items
  items: {
    getAll: ()         => apiRequest('/items'),
    get:    (id)       => apiRequest(`/items/${id}`),
    getBySubcat: async (subcatId) => {
      const all = await apiRequest('/items');
      return all.filter(i => i.SubcatID === subcatId);
    },
    getByCategory: async (catId) => {
      const all = await apiRequest('/items');
      return all.filter(i => i.CategoryID === catId);
    },
    add:    (r)        => apiRequest('/items', { method: 'POST', body: r }),
    put:    (r)        => apiRequest(`/items/${r.ItemID}`, { method: 'PUT', body: r }),
    delete: (id)       => apiRequest(`/items/${id}`, { method: 'DELETE' }),
  },

  // Orders
  orders: {
    getAll: ()         => apiRequest('/orders'),
    get:    (id)       => apiRequest(`/orders/${id}`),
    add:    (r)        => apiRequest('/orders', { method: 'POST', body: r }),
    put:    (r)        => apiRequest(`/orders/${r.OrderID}`, { method: 'PUT', body: r }),
    delete: (id)       => apiRequest(`/orders/${id}`, { method: 'DELETE' }),
    count:  async ()   => {
      const all = await apiRequest('/orders');
      return all.length;
    },
  },

  // OrderLines
  orderlines: {
    getAll: ()         => apiRequest('/orderlines'),
    getByOrder: async (orderId) => {
      const all = await apiRequest('/orderlines');
      return all.filter(l => l.OrderID === orderId);
    },
    get:    (id)       => apiRequest(`/orderlines/${id}`),
    add:    (r)        => apiRequest('/orderlines', { method: 'POST', body: r }),
    put:    (r)        => apiRequest(`/orderlines/${r.LineID}`, { method: 'PUT', body: r }),
    delete: (id)       => apiRequest(`/orderlines/${id}`, { method: 'DELETE' }),
    deleteByOrder: (orderId) => apiRequest(`/orderlines/order/${orderId}`, { method: 'DELETE' }),
  },

  // Users
  users: {
    getAll: ()         => apiRequest('/users'),
    get:    (id)       => apiRequest(`/users/${id}`),
    findByUsername: async (username) => {
      const all = await apiRequest('/users');
      return all.find(u => u.Username.toLowerCase() === username.toLowerCase()) || null;
    },
    add:    (r)        => apiRequest('/users', { method: 'POST', body: r }),
    put:    (r)        => apiRequest(`/users/${r.UserID}`, { method: 'PUT', body: r }),
    delete: (id)       => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  },

  // AuditLog
  auditlog: {
    getAll: ()         => apiRequest('/auditlog'),
    add:    (r)        => apiRequest('/auditlog', { method: 'POST', body: r }),
  },
};
