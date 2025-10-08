import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Get JWT token from localStorage for authentication
  const authToken = localStorage.getItem("auth_token");
  
  // CRITICAL FIX: Add cache-busting and no-cache headers to prevent 304 responses
  // This fixes deployment "0 forces" issue caused by empty 304 responses
  const cacheBustingUrl = url.includes('?') 
    ? `${url}&_ts=${Date.now()}` 
    : `${url}?_ts=${Date.now()}`;
    
  const res = await fetch(cacheBustingUrl, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store", // Force bypass cache
    credentials: "include", // Include session cookies for authentication
  });

  // Handle 401 responses for better UX
  if (res.status === 401 && authToken) {
    handleTokenExpiration();
    throw new Error('Authentication required');
  }

  // Handle 304 Not Modified by re-requesting with cache bypass
  if (res.status === 304) {
    console.warn('Got 304 response, retrying with cache bypass');
    const retryUrl = url.includes('?') 
      ? `${url}&_nocache=${Date.now()}` 
      : `${url}?_nocache=${Date.now()}`;
      
    const retryRes = await fetch(retryUrl, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
      body: data ? JSON.stringify(data) : undefined,
      cache: "reload", // Force fresh fetch
      credentials: "include", // Include session cookies for authentication
    });
    
    // Handle 401 responses for better UX
    if (retryRes.status === 401 && authToken) {
      handleTokenExpiration();
      throw new Error('Authentication required');
    }
    
    await throwIfResNotOk(retryRes);
    return retryRes;
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Get JWT token from localStorage for authentication
    const authToken = localStorage.getItem("auth_token");
    
    // CRITICAL FIX: Add cache-busting to prevent 304 responses in deployment
    const baseUrl = queryKey.join("/") as string;
    const cacheBustingUrl = baseUrl.includes('?') 
      ? `${baseUrl}&_ts=${Date.now()}` 
      : `${baseUrl}?_ts=${Date.now()}`;
      
    const res = await fetch(cacheBustingUrl, {
      headers: {
        ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
      cache: "no-store", // Force bypass cache
      credentials: "include", // Include session cookies for authentication
    });

    // Handle 304 Not Modified by re-requesting with different cache bypass
    if (res.status === 304) {
      console.warn('Got 304 in query, retrying with cache bypass');
      const retryUrl = baseUrl.includes('?') 
        ? `${baseUrl}&_nocache=${Date.now()}` 
        : `${baseUrl}?_nocache=${Date.now()}`;
        
      const retryRes = await fetch(retryUrl, {
        headers: {
          ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
        cache: "reload", // Force fresh fetch
        credentials: "include", // Include session cookies for authentication
      });
      
      if (unauthorizedBehavior === "returnNull" && retryRes.status === 401) {
        // Auto-logout on 401 for better UX
        handleTokenExpiration();
        return null;
      }
      
      await throwIfResNotOk(retryRes);
      return await retryRes.json();
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      // Auto-logout on 401 for better UX
      handleTokenExpiration();
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Centralized token expiration handling
function handleTokenExpiration() {
  console.warn('JWT token expired or invalid, logging out...');
  localStorage.removeItem("auth_token");
  
  // Clear query cache to reset app state
  queryClient.clear();
  
  // Redirect to login page
  window.location.href = "/login";
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
