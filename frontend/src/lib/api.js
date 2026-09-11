import axios from "axios";

const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.detail || err.message || "Something went wrong";
    err.friendlyMessage = typeof message === "string" ? message : "Request failed";
    return Promise.reject(err);
  }
);

export default api;
