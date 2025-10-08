import { storage } from "../storage";

export class JobsService {
  async generateReport(reportId: string, projectId: string, format: string) {
    try {
      await storage.updateReport(reportId, { status: "processing" });

      // Get project data
      const project = await storage.getProject(projectId);
      const forces = await storage.getDrivingForces(projectId);
      const clusters = await storage.getClusters(projectId);

      if (!project) {
        await storage.updateReport(reportId, { 
          status: "failed"
        });
        return;
      }

      // Simulate report generation
      await new Promise(resolve => setTimeout(resolve, 5000));

      // In a real implementation, this would generate actual PDF/Word/Excel files
      const reportUrl = `/api/v1/reports/${reportId}/download`;
      
      await storage.updateReport(reportId, { 
        status: "completed",
        url: reportUrl
      });

    } catch (error) {
      console.error("Report generation error:", error);
      await storage.updateReport(reportId, { 
        status: "failed"
      });
    }
  }

  async getRunningJobs(): Promise<any[]> {
    return await storage.getJobs("running");
  }

  async getJobStats(): Promise<any> {
    const jobs = await storage.getJobs();
    
    const stats = {
      total: jobs.length,
      pending: jobs.filter(j => j.status === "pending").length,
      running: jobs.filter(j => j.status === "running").length,
      completed: jobs.filter(j => j.status === "done").length,
      failed: jobs.filter(j => j.status === "failed").length,
    };

    return stats;
  }
}

export const jobsService = new JobsService();
