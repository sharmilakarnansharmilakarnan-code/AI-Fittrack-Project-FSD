import axios from "axios";

// Backend base URL. Configure via client/.env as VITE_API_BASE_URL if the
// server runs somewhere other than http://localhost:5000.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach the JWT (if present) to every outgoing request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("fittrack_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalize errors and handle expired/invalid sessions in one place
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Something went wrong. Please try again.";

    if (status === 401) {
      localStorage.removeItem("fittrack_token");
      localStorage.removeItem("fittrack_user");
    }

    return Promise.reject({ status, message, errors: error?.response?.data?.errors });
  }
);

export default apiClient;
