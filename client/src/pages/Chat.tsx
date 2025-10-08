import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { ORIONCopilot } from "@/components/chat/ORIONCopilot";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import type { Project, DrivingForce, Cluster } from "@shared/schema";

interface NetworkData {
  nodes: Array<{
    id: string;
    label: string;
    size: number;
    color: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export default function Chat() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const selectedForces = useAppStore((state) => state.selectedForces);
  const viewMode = useAppStore((state) => state.viewMode);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/v1/projects"],
  });

  const { data: forcesResponse } = useQuery<{ forces: DrivingForce[], total: number }>({
    queryKey: [`/api/v1/scanning/forces?project_id=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const forces = forcesResponse?.forces || [];

  const { data: clustersData = [] } = useQuery<Cluster[]>({
    queryKey: [`/api/v1/clusters?project_id=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: clusters } = useQuery<NetworkData>({
    queryKey: ["/api/v1/analytics/network", selectedProjectId],
    enabled: !!selectedProjectId,
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Prepare selected forces data for potential integration (not passed automatically)
  const selectedForcesData = useMemo(() => {
    if (!selectedForces.length) return [];
    
    const selectedSet = new Set(selectedForces);
    return forces.filter(force => force.id && selectedSet.has(force.id));
  }, [forces, selectedForces]);


  return (
    <div className="flex flex-col h-full">
      <Header 
        title="ORION Copilot"
        subtitle="Your strategic foresight and innovation assistant"
      />
      
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full flex flex-col max-w-7xl mx-auto">
          {/* Project Selection */}
          <Card className="p-6 mb-6 flex-shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg font-semibold mb-2">Project Context</h3>
                <p className="text-sm text-muted-foreground">
                  Select a project to start analyzing your strategic intelligence data
                </p>
              </div>
              
              <div className="w-full max-w-80">
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger data-testid="select-project">
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Main Content Area - Chat Only */}
          <div className="flex-1 min-h-0">
            {/* Main ORION Copilot Interface */}
            <ORIONCopilot 
              projectId={selectedProjectId} 
              className="h-full"
              projectData={{
                project: selectedProject,
                forcesCount: Number(forcesResponse?.total || forces?.length || 0),
                clustersCount: clustersData.length || 0,
                recentForces: forces?.slice(0, 10) || [],
                viewMode: viewMode,
                selectedForces: selectedForcesData,
                selectedForcesCount: selectedForcesData.length,
              }}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
