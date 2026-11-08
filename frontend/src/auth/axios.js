import axios from "axios";

let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_SERVER_URI,
  withCredentials: true
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Handle expired access tokens
api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Get a new access token using the refresh token cookie
        const response = await axios.post(
          `${import.meta.env.VITE_SERVER_URI}/auth/refresh-access-token`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = response.data.accessToken;

        // Store the new access token
        setAccessToken(newAccessToken);

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        return api(originalRequest);

      } catch (refreshError) {
        setAccessToken(null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
export const initializeAuth = async () => {
  try {
    const response = await axios.post(
      `${import.meta.env.VITE_SERVER_URI}/auth/refresh-access-token`,
      {},
      { withCredentials: true }
    );

    setAccessToken(response.data.accessToken);
    return response.data.accessToken;

  } catch (error) {
    setAccessToken(null);
    return null;
  }
}; 

export default api;