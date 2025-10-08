import { useQuery, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { useToast } from "./use-toast";

export interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "done" | "failed";
  progress: number;
  metaJson?: any;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface JobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

// Hook for fetching all jobs
export function useJobs(status?: string) {
  return useQuery({
    queryKey: ["/api/v1/jobs", status],
    refetchInterval: 2000, // Refresh every 2 seconds
  });
}

// Hook for fetching a specific job
export function useJob(jobId: string) {
  return useQuery({
    queryKey: ["/api/v1/jobs", jobId],
    enabled: !!jobId,
    refetchInterval: (data) => {
      // Stop refetching if job is done or failed
      const job = data as Job;
      return job?.status === "running" || job?.status === "pending" ? 1000 : false;
    },
  });
}

// Hook for job statistics
export function useJobStats() {
  return useQuery({
    queryKey: ["/api/v1/jobs", "stats"],
    refetchInterval: 3000,
  });
}

// Hook for managing job notifications
export function useJobNotifications() {
  const { data: jobs = [] } = useJobs();
  const { toast } = useToast();
  const addJobNotification = useAppStore((state) => state.addJobNotification);

  useEffect(() => {
    // Check for completed jobs and show notifications
    jobs.forEach((job: Job) => {
      if (job.status === "done" && !job.finishedAt) {
        // Job just completed
        addJobNotification({
          id: `job-${job.id}-completed`,
          type: "success",
          title: "Job Completed",
          message: `${job.type} job has finished successfully`,
          timestamp: new Date(),
        });

        toast({
          title: "Job Completed",
          description: `${job.type} job has finished successfully`,
        });
      } else if (job.status === "failed") {
        // Job failed
        addJobNotification({
          id: `job-${job.id}-failed`,
          type: "error",
          title: "Job Failed",
          message: job.error || `${job.type} job has failed`,
          timestamp: new Date(),
        });

        toast({
          title: "Job Failed",
          description: job.error || `${job.type} job has failed`,
          variant: "destructive",
        });
      }
    });
  }, [jobs, addJobNotification, toast]);

  return {
    runningJobs: jobs.filter((job: Job) => job.status === "running"),
    pendingJobs: jobs.filter((job: Job) => job.status === "pending"),
    completedJobs: jobs.filter((job: Job) => job.status === "done"),
    failedJobs: jobs.filter((job: Job) => job.status === "failed"),
  };
}

// Hook for starting preprocessing jobs
export function usePreprocessing() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, params }: { projectId: string; params: any }) => {
      const response = await fetch("/api/v1/scanning/preprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, params }),
      });

      if (!response.ok) {
        throw new Error("Failed to start preprocessing");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({
        title: "Processing Started",
        description: "Your data is being processed in the background",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Start Processing",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });
}

// Hook for report generation jobs
export function useReportGeneration() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportData: any) => {
      const response = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData),
      });

      if (!response.ok) {
        throw new Error("Failed to start report generation");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({
        title: "Report Generation Started",
        description: "Your report is being generated in the background",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Generate Report",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });
}

// Hook for canceling jobs (if supported by backend)
export function useCancelJob() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/v1/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel job");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({
        title: "Job Cancelled",
        description: "The job has been cancelled successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Cancel Job",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });
}

// Hook for retrying failed jobs
export function useRetryJob() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/v1/jobs/${jobId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to retry job");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({
        title: "Job Restarted",
        description: "The job has been restarted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Retry Job",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });
}

// Utility hook for job progress tracking
export function useJobProgress(jobId: string) {
  const { data: job } = useJob(jobId);

  const progress = job?.progress || 0;
  const isRunning = job?.status === "running";
  const isCompleted = job?.status === "done";
  const isFailed = job?.status === "failed";
  const isPending = job?.status === "pending";

  const estimatedTimeRemaining = useCallback(() => {
    if (!job || !isRunning || progress === 0) return null;

    const elapsed = new Date().getTime() - new Date(job.createdAt).getTime();
    const rate = progress / elapsed;
    const remaining = (100 - progress) / rate;

    return Math.max(0, remaining);
  }, [job, isRunning, progress]);

  return {
    job,
    progress,
    isRunning,
    isCompleted,
    isFailed,
    isPending,
    estimatedTimeRemaining: estimatedTimeRemaining(),
  };
}

export default useJobs;
