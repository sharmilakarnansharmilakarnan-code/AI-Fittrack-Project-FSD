import apiClient from "./client";

export const authApi = {
  register: (payload) => apiClient.post("/auth/register", payload),
  login: (payload) => apiClient.post("/auth/login", payload),
  profile: () => apiClient.get("/auth/profile"),
  updateProfile: (payload) => apiClient.put("/auth/profile", payload),
};

export const workoutApi = {
  create: (payload) => apiClient.post("/workouts", payload),
  list: (params = {}) => apiClient.get("/workouts", { params }),
  getById: (id) => apiClient.get(`/workouts/${id}`),
  update: (id, payload) => apiClient.put(`/workouts/${id}`, payload),
  remove: (id) => apiClient.delete(`/workouts/${id}`),
  search: (params = {}) => apiClient.get("/workouts/search", { params }),
};

export const goalApi = {
  list: (params = {}) => apiClient.get("/goals", { params }),
  create: (payload) => apiClient.post("/goals", payload),
  update: (id, payload) => apiClient.put(`/goals/${id}`, payload),
  remove: (id) => apiClient.delete(`/goals/${id}`),
};

export const progressApi = {
  summary: () => apiClient.get("/progress/summary"),
  weekly: (weeks = 8) => apiClient.get("/progress/weekly", { params: { weeks } }),
};

export const attendanceApi = {
  list: (params = {}) => apiClient.get("/attendance", { params }),
  checkIn: () => apiClient.post("/attendance/check-in"),
  checkOut: () => apiClient.post("/attendance/check-out"),
};

export const aiApi = {
  recommendation: (payload = {}) => apiClient.post("/ai/recommendation", payload),
  fitnessInsights: () => apiClient.get("/ai/fitness-insights"),
};

export const adminApi = {
  stats: () => apiClient.get("/admin/stats"),
  users: (params = {}) => apiClient.get("/admin/users", { params }),
  setRole: (id, role) => apiClient.put(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => apiClient.delete(`/admin/users/${id}`),
};
