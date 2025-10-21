import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAppActions, useCurrentProject } from "@/lib/store";
import { 
  Plus, 
  Search, 
  Calendar, 
  Folder,
  MoreHorizontal,
  Trash2,
  Copy,
  Crown,
  Info
} from "lucide-react";
import type { z } from "zod";
import type { Project, DrivingForce } from "@shared/schema";

type InsertProject = z.infer<typeof insertProjectSchema>;

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { setCurrentProject } = useAppActions();
  const currentProjectId = useCurrentProject();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/v1/projects"],
  });

  // Auto-select default project if no current project is set
  useEffect(() => {
    if (!isLoading && projects.length > 0 && !currentProjectId) {
      const defaultProject = projects.find((p) => p.isDefault);
      if (defaultProject) {
        console.log("Auto-selecting default project:", defaultProject.name);
        setCurrentProject(defaultProject.id);
      }
    }
  }, [projects, isLoading, currentProjectId, setCurrentProject]);

  // Function to handle project selection
  const handleProjectClick = (project: Project) => {
    setCurrentProject(project.id);
    setLocation("/scanning"); // Navigate to scanning page with the selected project's driving forces
  };

  // Get all project statistics for all projects at once
  const projectIds = projects.map((p) => p.id);
  
  // Fetch forces for all projects using a simpler approach
  const { data: allForces = [] } = useQuery<Array<{ projectId: string; forces: DrivingForce[]; total: number }>>({
    queryKey: ["/api/v1/scanning/forces/batch", projectIds.sort().join(",")],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      
      // Fetch forces for each project
      const results = await Promise.all(
        projectIds.map(async (projectId: string) => {
          try {
            const response = await apiRequest("GET", `/api/v1/scanning/forces?project_id=${projectId}`);
            const data = await response.json();
            const forces = Array.isArray(data) ? data : (data.forces ?? []);
            const total = data.total ?? forces.length;
            console.log(`Fetched ${forces.length} forces for project ${projectId}, total: ${total}`);
            return { projectId, forces, total };
          } catch (error) {
            console.error(`Error fetching forces for project ${projectId}:`, error);
            return { projectId, forces: [], total: 0 };
          }
        })
      );
      
      return results;
    },
    enabled: projectIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });


  // Helper function to get stats for a specific project
  const getProjectStats = (projectId: string) => {
    const projectForces = allForces.find((p) => p.projectId === projectId);
    const project = projects.find((p) => p.id === projectId);
    
    // For default project, use total database count instead of paginated results
    const forcesCount = project?.isDefault 
      ? (projectForces?.total || 0)
      : (projectForces?.forces?.length || 0);
    
    return {
      forcesCount,
    };
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      const response = await apiRequest("POST", "/api/v1/projects", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Project created",
        description: "Your new project has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (data: { id: string; isDefault: boolean }) => {
      if (data.isDefault) {
        throw new Error("Cannot delete default project");
      }
      await apiRequest("DELETE", `/api/v1/projects/${data.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      toast({
        title: "Project deleted",
        description: "The project has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message === "Cannot delete default project" 
          ? "Cannot delete the default ORION project." 
          : "Failed to delete project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      projectType: "new_project",
    },
  });

  const onSubmit = (data: InsertProject) => {
    createMutation.mutate(data);
  };

  const filteredProjects = projects
    .filter((project: Project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      // Sort by default status first (default project appears first)
      // Then alphabetically by name for consistent ordering
      return Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name);
    });

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Projects"
        subtitle="Manage your strategic intelligence projects"
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Search and Create */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative w-96">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 transform -translate-y-1/2" />
            <Input
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-projects"
            />
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-create-project">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter project name" {...field} data-testid="input-project-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Enter project description"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-project-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                      data-testid="button-cancel-create"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending}
                      data-testid="button-submit-create"
                    >
                      {createMutation.isPending ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground">Loading projects...</div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <Folder className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm ? "No matching projects" : "No projects yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? "Try adjusting your search terms" 
                : "Create your first strategic intelligence project to get started"
              }
            </p>
            {!searchTerm && (
              <div className="text-center">
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)}
                  data-testid="button-create-first-project"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Start with the default ORION database to explore strategic intelligence.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project: Project) => {
              const stats = getProjectStats(project.id);
              const isDefault = project.isDefault;
              const isCurrentProject = currentProjectId === project.id;
              
              return (
                <Card 
                  key={project.id} 
                  className={`p-6 hover:shadow-md transition-all cursor-pointer relative ${
                    isDefault ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20' : ''
                  } ${
                    isCurrentProject ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleProjectClick(project)}
                  data-testid={`project-card-${project.id}`}
                >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg" data-testid={`project-name-${project.id}`}>
                        {project.name}
                      </h3>
                      {isDefault && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="default" className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200">
                                <Crown className="w-3 h-3 mr-1" />
                                Default
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Master ORION database with pre-loaded strategic intelligence</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isCurrentProject && (
                        <Badge variant="outline" className="text-primary border-primary">
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {isDefault 
                        ? "Pre-loaded ORION strategic intelligence database with curated driving forces and insights. This is your starting point for strategic analysis."
                        : (project.description || "No description provided")
                      }
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    data-testid={`project-menu-${project.id}`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  {/* Project Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Forces:</span>
                    <Badge variant="secondary">{stats.forcesCount}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span className="text-muted-foreground">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 mr-1" />
                    {new Date(project.createdAt).toLocaleDateString()}
                    {isDefault && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="ml-2">
                            <Info className="w-3 h-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>System-generated project</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            data-testid={`button-duplicate-${project.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isDefault ? "Create a custom project based on this template" : "Duplicate this project"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={isDefault}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isDefault) {
                                deleteMutation.mutate({ id: project.id, isDefault });
                              }
                            }}
                            data-testid={`button-delete-${project.id}`}
                            className={isDefault ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isDefault ? "Cannot delete the default ORION project" : "Delete this project"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
