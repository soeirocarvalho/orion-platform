import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const queryClient = useQueryClient();
  
  // Get JWT token from localStorage
  const getAuthToken = () => {
    return localStorage.getItem("auth_token");
  };

  // Set auth headers for API requests
  const getAuthHeaders = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !!getAuthToken(), // Only fetch if token exists
  });

  const logout = () => {
    // Clear token from localStorage
    localStorage.removeItem("auth_token");
    
    // Clear all queries to reset app state
    queryClient.clear();
    
    // Redirect to welcome page
    window.location.href = "/";
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!getAuthToken(),
    getAuthToken,
    getAuthHeaders,
    logout,
  };
}