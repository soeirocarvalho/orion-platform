import { queryClient } from "./queryClient";

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

export class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = "/api/v1") {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        credentials: "include",
        ...options,
      });

      const data = response.ok ? await response.json() : null;

      if (!response.ok) {
        return {
          error: data?.message || data?.error || response.statusText,
          status: response.status,
        };
      }

      return {
        data,
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Network error",
        status: 0,
      };
    }
  }

  // Projects
  async getProjects() {
    return this.request("/projects");
  }

  async getProject(id: string) {
    return this.request(`/projects/${id}`);
  }

  async createProject(data: any) {
    return this.request("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: any) {
    return this.request(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request(`/projects/${id}`, {
      method: "DELETE",
    });
  }

  // Driving Forces
  async getDrivingForces(projectId?: string, lens?: string, filters?: any) {
    const params = new URLSearchParams();
    if (projectId) params.append("project_id", projectId);
    if (lens) params.append("lens", lens);
    if (filters?.steep) params.append("steep", filters.steep);
    if (filters?.search) params.append("search", filters.search);

    return this.request(`/scanning/forces?${params}`);
  }

  async importDrivingForces(projectId: string, forces: any[]) {
    return this.request("/scanning/import", {
      method: "POST",
      body: JSON.stringify({ projectId, forces }),
    });
  }

  async preprocessProject(projectId: string, params: any) {
    return this.request("/scanning/preprocess", {
      method: "POST",
      body: JSON.stringify({ projectId, params }),
    });
  }

  // Analytics
  async getRadarData(projectId: string) {
    return this.request(`/analytics/radar?project_id=${projectId}`);
  }

  async getNetworkData(projectId: string) {
    return this.request(`/analytics/network?project_id=${projectId}`);
  }

  // Jobs
  async getJobs(status?: string) {
    const params = status ? `?status=${status}` : "";
    return this.request(`/jobs${params}`);
  }

  async getJob(id: string) {
    return this.request(`/jobs/${id}`);
  }

  async getJobStats() {
    return this.request("/jobs/stats");
  }

  // Reports
  async getReports(projectId?: string) {
    const params = projectId ? `?project_id=${projectId}` : "";
    return this.request(`/reports${params}`);
  }

  async createReport(data: any) {
    return this.request("/reports", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Utility methods
  async healthCheck() {
    return this.request("/health");
  }

  // Cache management
  invalidateCache(queryKey: string[]) {
    queryClient.invalidateQueries({ queryKey });
  }

  // Optimistic updates
  updateCache<T>(queryKey: string[], updater: (oldData: T) => T) {
    queryClient.setQueryData(queryKey, updater);
  }
}

export const apiClient = new ApiClient();

// Helper functions for common operations
export const api = {
  projects: {
    list: () => apiClient.getProjects(),
    get: (id: string) => apiClient.getProject(id),
    create: (data: any) => apiClient.createProject(data),
    update: (id: string, data: any) => apiClient.updateProject(id, data),
    delete: (id: string) => apiClient.deleteProject(id),
  },
  
  forces: {
    list: (projectId?: string, lens?: string, filters?: any) => 
      apiClient.getDrivingForces(projectId, lens, filters),
    import: (projectId: string, forces: any[]) => 
      apiClient.importDrivingForces(projectId, forces),
    preprocess: (projectId: string, params: any) => 
      apiClient.preprocessProject(projectId, params),
  },

  analytics: {
    radar: (projectId: string) => apiClient.getRadarData(projectId),
    network: (projectId: string) => apiClient.getNetworkData(projectId),
  },

  jobs: {
    list: (status?: string) => apiClient.getJobs(status),
    get: (id: string) => apiClient.getJob(id),
    stats: () => apiClient.getJobStats(),
  },

  reports: {
    list: (projectId?: string) => apiClient.getReports(projectId),
    create: (data: any) => apiClient.createReport(data),
  },
};

export default apiClient;
