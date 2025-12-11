import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('authToken');
  }
};

export const grievanceService = {
  getAllGrievances: async (filters = {}) => {
    const response = await api.get('/grievances', { params: filters });
    return response.data;
  },

  getGrievanceById: async (id) => {
    const response = await api.get(`/grievances/${id}`);
    return response.data;
  },

  getUserGrievances: async () => {
    const response = await api.get('/grievances/user');
    return response.data;
  },

  createGrievance: async (grievanceData) => {
    const response = await api.post('/grievances', grievanceData);
    return response.data;
  },

  updateGrievanceStatus: async (id, status, remarks) => {
    const response = await api.patch(`/grievances/${id}/status`, { status, remarks });
    return response.data;
  },

  deleteGrievance: async (id) => {
    const response = await api.delete(`/grievances/${id}`);
    return response.data;
  }
};

export const userService = {
  getAllUsers: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  getUserById: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  updateUser: async (id, userData) => {
    const response = await api.patch(`/users/${id}`, userData);
    return response.data;
  },

  updateUserProfile: async (userData) => {
    const response = await api.patch('/users/profile', userData);
    return response.data;
  },

  updateUserRole: async (id, role) => {
    const response = await api.patch(`/users/${id}/role`, { role });
    return response.data;
  }
};

export const statsService = {
  getAdminStats: async () => {
    const response = await api.get('/stats/admin');
    return response.data;
  },

  getUserStats: async () => {
    const response = await api.get('/stats/user');
    return response.data;
  }
};

export const announcementService = {
  getAllAnnouncements: async () => {
    const response = await api.get('/announcements');
    return response.data;
  },

  createAnnouncement: async (announcementData) => {
    const response = await api.post('/announcements', announcementData);
    return response.data;
  },

  deleteAnnouncement: async (id) => {
    const response = await api.delete(`/announcements/${id}`);
    return response.data;
  }
};

export default api;
