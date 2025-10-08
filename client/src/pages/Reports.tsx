import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertReportSchema } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { 
  Plus, 
  Download, 
  FileText, 
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Eye
} from "lucide-react";
import { z } from "zod";

type InsertReport = z.infer<typeof insertReportSchema>;

export default function Reports() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  // Get the list of projects first
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/v1/projects"],
  });

  // Use store for accessing project state and setting updates
  const store = useAppStore();
  const selectedForces = useAppStore((state) => state.selectedForces);
  
  // Determine which project to use - validate stored ID against available projects
  let currentProjectId = store.currentProjectId;
  
  // If stored project ID doesn't exist in current projects, reset to default
  if (currentProjectId && projects && !projects.find((p: any) => p.id === currentProjectId)) {
    currentProjectId = null;
  }
  
  // Fall back to default or first available project
  if (!currentProjectId && projects) {
    currentProjectId = projects.find((p: any) => p.isDefault)?.id || projects[0]?.id;
  }
  
  // Update store with validated project ID (using useEffect to avoid state writes during render)
  React.useEffect(() => {
    if (currentProjectId && store.currentProjectId !== currentProjectId) {
      store.setCurrentProjectId(currentProjectId);
    }
  }, [currentProjectId, store]);

  const { data: reports = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/v1/reports?project_id=${currentProjectId}`],
    enabled: !!currentProjectId,
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertReport) => {
      const response = await apiRequest("POST", "/api/v1/reports", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/v1/reports?project_id=${currentProjectId}`] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Report generation started",
        description: "Your report is being generated in the background. You'll be notified when it's ready.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start report generation. Please try again.",
        variant: "destructive",
      });
    },
  });

  type ExtendedReportForm = InsertReport & { sections: string[] };
  const form = useForm<ExtendedReportForm>({
    resolver: zodResolver(insertReportSchema.extend({
      sections: z.array(z.string()).min(1, "Select at least one section"),
    })),
    defaultValues: {
      projectId: currentProjectId || "",
      format: "pdf" as const,
      sections: ["executive_summary", "driving_forces_list"],
    },
  });

  // Update form projectId when currentProjectId changes
  React.useEffect(() => {
    if (currentProjectId && form.getValues("projectId") !== currentProjectId) {
      form.setValue("projectId", currentProjectId);
    }
  }, [currentProjectId, form]);

  const onSubmit = (data: ExtendedReportForm) => {
    const { sections, ...reportData } = data;
    const finalData = {
      ...reportData,
      sections: sections.join(","),
      selectedForceIds: selectedForces, // Include selected force IDs
    };
    createMutation.mutate(finalData);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-chart-3 animate-spin" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-chart-2" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-muted text-muted-foreground";
      case "processing":
        return "bg-chart-3/20 text-chart-3";
      case "completed":
        return "bg-chart-2/20 text-chart-2";
      case "failed":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const currentProject = projects && projects.find((p: any) => p.id === currentProjectId);

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Reports"
        subtitle={currentProject?.name || "Generate and manage strategic intelligence reports"}
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold">Report Management</h3>
            <p className="text-sm text-muted-foreground">
              Create comprehensive reports from your strategic intelligence data
            </p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-create-report">
                <Plus className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Generate New Report</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="format"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Report Format</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger data-testid="select-report-format">
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pdf">PDF Document</SelectItem>
                              <SelectItem value="docx">Word Document</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sections"
                    render={() => (
                      <FormItem>
                        <FormLabel>Report Sections</FormLabel>
                        <div className="space-y-2">
                          {[
                            { id: "executive_summary", label: "Executive Summary", description: "High-level strategic overview" },
                            { id: "driving_forces_list", label: "Driving Forces List and Description", description: "Comprehensive list of driving forces with title, two-paragraph descriptions, dimensions, and sources" },
                          ].map((section) => (
                            <FormField
                              key={section.id}
                              control={form.control}
                              name="sections"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={section.id}
                                    className="flex flex-row items-start space-x-3 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(section.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, section.id])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (value) => value !== section.id
                                                )
                                              )
                                        }}
                                        data-testid={`checkbox-section-${section.id}`}
                                      />
                                    </FormControl>
                                    <div>
                                      <FormLabel className="text-sm font-normal">
                                        {section.label}
                                      </FormLabel>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {section.description}
                                      </p>
                                    </div>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                      data-testid="button-cancel-report"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending}
                      data-testid="button-submit-report"
                    >
                      {createMutation.isPending ? "Starting..." : "Generate"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground mb-4" />
            <div className="text-muted-foreground">Loading reports...</div>
          </div>
        ) : reports.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No reports yet</h3>
            <p className="text-muted-foreground mb-4">
              Generate your first strategic intelligence report to get started
            </p>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              data-testid="button-create-first-report"
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report: any) => (
              <Card key={report.id} className="p-6" data-testid={`report-card-${report.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold" data-testid={`report-title-${report.id}`}>
                          {report.format.toUpperCase()} Report
                        </h3>
                        <Badge className={getStatusColor(report.status)}>
                          <div className="flex items-center space-x-1">
                            {getStatusIcon(report.status)}
                            <span className="capitalize" data-testid={`report-status-${report.id}`}>
                              {report.status}
                            </span>
                          </div>
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(report.createdAt).toLocaleDateString()} at{" "}
                        {new Date(report.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {report.status === "completed" && report.url && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          data-testid={`button-preview-${report.id}`}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => window.open(report.url, '_blank')}
                          data-testid={`button-download-${report.id}`}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </>
                    )}
                    
                    {report.status === "processing" && (
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating...</span>
                      </div>
                    )}

                    {report.status === "failed" && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          // Retry logic would go here
                          toast({
                            title: "Retry not implemented",
                            description: "Please create a new report instead.",
                          });
                        }}
                        data-testid={`button-retry-${report.id}`}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>

                {report.status === "processing" && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="text-muted-foreground">Estimated 2-3 minutes</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-chart-3 h-2 rounded-full transition-all duration-300" 
                        style={{ width: "65%" }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
