import * as XLSX from 'xlsx';
import { storage } from "../storage";
import type { DrivingForce, Cluster, ClusteringReport, Project } from "@shared/schema";

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'txt';

export interface ClusterExportOptions {
  format: ExportFormat;
  includeForces?: boolean;
  includeQualityMetrics?: boolean;
  includeVisualizationData?: boolean;
  clusterIds?: string[];
}

export interface ExportResult {
  filename: string;
  contentType: string;
  data: Buffer | string;
}

export class ExportService {
  /**
   * Export clusters and related data based on provided options
   */
  async exportClusters(projectId: string, options: ClusterExportOptions): Promise<ExportResult> {
    try {
      console.log(`Starting cluster export for project ${projectId} with format ${options.format}`);
      
      // Fetch project data
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      
      // Fetch clusters - use 37 meaningful clusters from orion_import
      let clusters = await storage.getClusters(projectId, 'orion_import');
      
      // Filter clusters if specific IDs provided
      if (options.clusterIds && options.clusterIds.length > 0) {
        clusters = clusters.filter(cluster => options.clusterIds!.includes(cluster.id));
      }
      
      if (clusters.length === 0) {
        throw new Error('No clusters found for export');
      }
      
      // Fetch driving forces if requested
      let forces: DrivingForce[] = [];
      if (options.includeForces) {
        forces = await storage.getDrivingForces(projectId);
      }
      
      // Fetch clustering reports if needed
      let reports: ClusteringReport[] = [];
      if (options.includeQualityMetrics) {
        reports = await storage.getClusteringReports(projectId);
      }
      
      // Prepare export data
      const exportData = {
        project,
        clusters,
        forces: options.includeForces ? forces : undefined,
        reports: options.includeQualityMetrics ? reports : undefined,
        exportOptions: options,
        exportedAt: new Date().toISOString(),
        summary: {
          totalClusters: clusters.length,
          totalForces: forces.length,
          exportFormat: options.format
        }
      };
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const projectName = project.name.replace(/[^a-zA-Z0-9]/g, '_');
      const baseFilename = `${projectName}_clusters_${timestamp}`;
      
      // Export based on format
      switch (options.format) {
        case 'json':
          return this.exportAsJSON(exportData, baseFilename);
        case 'csv':
          return this.exportAsCSV(exportData, baseFilename);
        case 'xlsx':
          return this.exportAsExcel(exportData, baseFilename);
        case 'txt':
          return this.exportAsText(exportData, baseFilename);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
      
    } catch (error) {
      console.error('Cluster export error:', error);
      throw new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Export algorithm comparison data
   */
  async exportAlgorithmComparison(projectId: string, format: 'csv' | 'json'): Promise<ExportResult> {
    try {
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      
      const reports = await storage.getClusteringReports(projectId);
      const clusters = await storage.getClusters(projectId, 'orion_import');
      
      // Group clusters by algorithm
      const algorithmData = clusters.reduce((acc, cluster) => {
        const method = cluster.method;
        if (!acc[method]) {
          acc[method] = {
            algorithm: method,
            clusters: [],
            averageQuality: { silhouette: 0, cohesion: 0, separation: 0 },
            totalClusters: 0,
            totalForces: 0
          };
        }
        
        acc[method].clusters.push(cluster);
        acc[method].totalClusters++;
        acc[method].totalForces += cluster.size;
        
        return acc;
      }, {} as Record<string, any>);
      
      // Calculate averages for each algorithm
      Object.values(algorithmData).forEach((data: any) => {
        const clusters = data.clusters;
        if (clusters.length > 0) {
          data.averageQuality.silhouette = clusters.reduce((sum: number, c: any) => sum + (c.silhouetteScore || 0), 0) / clusters.length;
          data.averageQuality.cohesion = clusters.reduce((sum: number, c: any) => sum + (c.cohesion || 0), 0) / clusters.length;
          data.averageQuality.separation = clusters.reduce((sum: number, c: any) => sum + (c.separation || 0), 0) / clusters.length;
        }
      });
      
      const comparisonData = {
        project,
        algorithmComparison: Object.values(algorithmData),
        reports,
        exportedAt: new Date().toISOString(),
        summary: {
          algorithmsCompared: Object.keys(algorithmData).length,
          totalClusters: clusters.length
        }
      };
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const projectName = project.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${projectName}_algorithm_comparison_${timestamp}`;
      
      if (format === 'json') {
        return {
          filename: `${filename}.json`,
          contentType: 'application/json',
          data: JSON.stringify(comparisonData, null, 2)
        };
      } else {
        return this.exportComparisonAsCSV(comparisonData, filename);
      }
      
    } catch (error) {
      console.error('Algorithm comparison export error:', error);
      throw new Error(`Algorithm comparison export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Export quality timeline data
   */
  async exportQualityTimeline(projectId: string, format: 'csv' | 'json'): Promise<ExportResult> {
    try {
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      
      const reports = await storage.getClusteringReports(projectId);
      const clusters = await storage.getClusters(projectId, 'orion_import');
      
      // Create timeline data ordered by creation date
      const timelineData = reports
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((report, index) => ({
          sequence: index + 1,
          timestamp: report.createdAt,
          algorithm: report.algorithm,
          clustersCount: report.clustersCount || 0,
          forcesProcessed: report.forcesProcessed || 0,
          executionTime: report.executionTime || 0,
          averageSilhouette: report.averageSilhouette || 0,
          daviesBouldinIndex: report.daviesBouldinIndex || 0,
          calinskiHarabaszIndex: report.calinskiHarabaszIndex || 0,
          totalInertia: report.totalInertia || 0,
          recommendedClusters: report.recommendedClusters || 0,
          params: report.params
        }));
      
      const exportData = {
        project,
        qualityTimeline: timelineData,
        exportedAt: new Date().toISOString(),
        summary: {
          timelineEntries: timelineData.length,
          dateRange: timelineData.length > 0 ? {
            start: timelineData[0].timestamp,
            end: timelineData[timelineData.length - 1].timestamp
          } : null
        }
      };
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const projectName = project.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${projectName}_quality_timeline_${timestamp}`;
      
      if (format === 'json') {
        return {
          filename: `${filename}.json`,
          contentType: 'application/json',
          data: JSON.stringify(exportData, null, 2)
        };
      } else {
        return this.exportTimelineAsCSV(exportData, filename);
      }
      
    } catch (error) {
      console.error('Quality timeline export error:', error);
      throw new Error(`Quality timeline export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Export data as JSON
   */
  private exportAsJSON(data: any, filename: string): ExportResult {
    return {
      filename: `${filename}.json`,
      contentType: 'application/json',
      data: JSON.stringify(data, null, 2)
    };
  }
  
  /**
   * Export data as CSV
   */
  private exportAsCSV(data: any, filename: string): ExportResult {
    let csvContent = '';
    
    // Export clusters as main CSV content
    if (data.clusters && data.clusters.length > 0) {
      // CSV headers
      const headers = [
        'Cluster ID',
        'Label',
        'Algorithm',
        'Size',
        'Silhouette Score',
        'Cohesion',
        'Separation',
        'Inertia',
        'Created At',
        'Force IDs'
      ];
      
      csvContent += headers.join(',') + '\n';
      
      // CSV data rows
      data.clusters.forEach((cluster: Cluster) => {
        const row = [
          `"${cluster.id}"`,
          `"${cluster.label}"`,
          `"${cluster.method}"`,
          cluster.size,
          cluster.silhouetteScore || '',
          cluster.cohesion || '',
          cluster.separation || '',
          cluster.inertia || '',
          `"${cluster.createdAt}"`,
          `"${(cluster.forceIds || []).join(';')}"`
        ];
        csvContent += row.join(',') + '\n';
      });
    }
    
    // Add forces data if included
    if (data.forces && data.forces.length > 0) {
      csvContent += '\n\nDriving Forces:\n';
      const forceHeaders = [
        'Force ID',
        'Title',
        'Type',
        'STEEP',
        'Scope',
        'Impact',
        'TTM',
        'Sentiment',
        'Source',
        'Tags'
      ];
      
      csvContent += forceHeaders.join(',') + '\n';
      
      data.forces.forEach((force: DrivingForce) => {
        const row = [
          `"${force.id}"`,
          `"${force.title.replace(/"/g, '""')}"`,
          `"${force.type}"`,
          `"${force.steep}"`,
          `"${force.scope || ''}"`,
          force.impact || '',
          `"${force.ttm || ''}"`,
          `"${force.sentiment || ''}"`,
          `"${force.source || ''}"`,
          `"${(force.tags || []).join(';')}"`
        ];
        csvContent += row.join(',') + '\n';
      });
    }
    
    return {
      filename: `${filename}.csv`,
      contentType: 'text/csv',
      data: csvContent
    };
  }
  
  /**
   * Export data as Excel workbook
   */
  private exportAsExcel(data: any, filename: string): ExportResult {
    const workbook = XLSX.utils.book_new();
    
    // Clusters worksheet
    if (data.clusters && data.clusters.length > 0) {
      const clustersData = data.clusters.map((cluster: Cluster) => ({
        'Cluster ID': cluster.id,
        'Label': cluster.label,
        'Algorithm': cluster.method,
        'Size': cluster.size,
        'Silhouette Score': cluster.silhouetteScore || '',
        'Cohesion': cluster.cohesion || '',
        'Separation': cluster.separation || '',
        'Inertia': cluster.inertia || '',
        'Created At': cluster.createdAt,
        'Force Count': (cluster.forceIds || []).length,
        'Parameters': JSON.stringify(cluster.params)
      }));
      
      const clustersWorksheet = XLSX.utils.json_to_sheet(clustersData);
      XLSX.utils.book_append_sheet(workbook, clustersWorksheet, 'Clusters');
    }
    
    // Forces worksheet (if included)
    if (data.forces && data.forces.length > 0) {
      const forcesData = data.forces.map((force: DrivingForce) => ({
        'Force ID': force.id,
        'Title': force.title,
        'Type': force.type,
        'STEEP': force.steep,
        'Scope': force.scope || '',
        'Impact': force.impact || '',
        'TTM': force.ttm || '',
        'Sentiment': force.sentiment || '',
        'Source': force.source || '',
        'Tags': (force.tags || []).join(', '),
        'Text': force.text.substring(0, 500) + (force.text.length > 500 ? '...' : ''),
        'Created At': force.createdAt
      }));
      
      const forcesWorksheet = XLSX.utils.json_to_sheet(forcesData);
      XLSX.utils.book_append_sheet(workbook, forcesWorksheet, 'Driving Forces');
    }
    
    // Quality metrics worksheet (if included)
    if (data.reports && data.reports.length > 0) {
      const qualityData = data.reports.map((report: ClusteringReport) => ({
        'Report ID': report.id,
        'Algorithm': report.algorithm,
        'Execution Time (ms)': report.executionTime || '',
        'Recommended Clusters': report.recommendedClusters || '',
        'Average Silhouette': report.averageSilhouette || '',
        'Davies Bouldin Index': report.daviesBouldinIndex || '',
        'Calinski Harabasz Index': report.calinskiHarabaszIndex || '',
        'Total Inertia': report.totalInertia || '',
        'Clusters Count': report.clustersCount || '',
        'Forces Processed': report.forcesProcessed || '',
        'Created At': report.createdAt,
        'Parameters': JSON.stringify(report.params)
      }));
      
      const qualityWorksheet = XLSX.utils.json_to_sheet(qualityData);
      XLSX.utils.book_append_sheet(workbook, qualityWorksheet, 'Quality Metrics');
    }
    
    // Project summary worksheet
    const summaryData = [
      { Field: 'Project Name', Value: data.project.name },
      { Field: 'Project ID', Value: data.project.id },
      { Field: 'Description', Value: data.project.description || '' },
      { Field: 'Export Date', Value: data.exportedAt },
      { Field: 'Total Clusters', Value: data.summary.totalClusters },
      { Field: 'Total Forces', Value: data.summary.totalForces },
      { Field: 'Export Format', Value: data.summary.exportFormat }
    ];
    
    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
    
    // Generate Excel buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    return {
      filename: `${filename}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer
    };
  }
  
  /**
   * Export data as formatted text report
   */
  private exportAsText(data: any, filename: string): ExportResult {
    let textContent = '';
    
    // Header
    textContent += `ORION CLUSTER ANALYSIS REPORT\n`;
    textContent += `=====================================\n\n`;
    textContent += `Project: ${data.project.name}\n`;
    textContent += `Export Date: ${new Date(data.exportedAt).toLocaleString()}\n`;
    textContent += `Total Clusters: ${data.summary.totalClusters}\n`;
    textContent += `Total Forces: ${data.summary.totalForces}\n\n`;
    
    // Clusters section
    if (data.clusters && data.clusters.length > 0) {
      textContent += `CLUSTER ANALYSIS RESULTS\n`;
      textContent += `========================\n\n`;
      
      data.clusters.forEach((cluster: Cluster, index: number) => {
        textContent += `Cluster ${index + 1}: ${cluster.label}\n`;
        textContent += `  - ID: ${cluster.id}\n`;
        textContent += `  - Algorithm: ${cluster.method}\n`;
        textContent += `  - Size: ${cluster.size} forces\n`;
        textContent += `  - Quality Metrics:\n`;
        textContent += `    * Silhouette Score: ${cluster.silhouetteScore?.toFixed(3) || 'N/A'}\n`;
        textContent += `    * Cohesion: ${cluster.cohesion?.toFixed(3) || 'N/A'}\n`;
        textContent += `    * Separation: ${cluster.separation?.toFixed(3) || 'N/A'}\n`;
        
        if (cluster.inertia) {
          textContent += `    * Inertia: ${cluster.inertia.toFixed(3)}\n`;
        }
        
        textContent += `  - Created: ${new Date(cluster.createdAt).toLocaleString()}\n`;
        
        if (cluster.params) {
          textContent += `  - Parameters: ${JSON.stringify(cluster.params)}\n`;
        }
        
        textContent += `\n`;
      });
    }
    
    // Forces section (if included)
    if (data.forces && data.forces.length > 0) {
      textContent += `DRIVING FORCES DETAILS\n`;
      textContent += `======================\n\n`;
      
      data.forces.slice(0, 50).forEach((force: DrivingForce, index: number) => {
        textContent += `${index + 1}. ${force.title}\n`;
        textContent += `   Type: ${force.type} | STEEP: ${force.steep}\n`;
        
        if (force.impact) {
          textContent += `   Impact: ${force.impact}/10`;
        }
        
        if (force.ttm) {
          textContent += ` | TTM: ${force.ttm}`;
        }
        
        if (force.sentiment) {
          textContent += ` | Sentiment: ${force.sentiment}`;
        }
        
        textContent += `\n`;
        
        if (force.text && force.text.length > 0) {
          const preview = force.text.substring(0, 200);
          textContent += `   "${preview}${force.text.length > 200 ? '...' : ''}"\n`;
        }
        
        textContent += `\n`;
      });
      
      if (data.forces.length > 50) {
        textContent += `... and ${data.forces.length - 50} more forces\n\n`;
      }
    }
    
    // Quality reports section (if included)
    if (data.reports && data.reports.length > 0) {
      textContent += `QUALITY METRICS SUMMARY\n`;
      textContent += `=======================\n\n`;
      
      data.reports.forEach((report: ClusteringReport, index: number) => {
        textContent += `Report ${index + 1} (${report.algorithm}):\n`;
        textContent += `  - Average Silhouette: ${report.averageSilhouette?.toFixed(3) || 'N/A'}\n`;
        textContent += `  - Davies Bouldin Index: ${report.daviesBouldinIndex?.toFixed(3) || 'N/A'}\n`;
        textContent += `  - Calinski Harabasz Index: ${report.calinskiHarabaszIndex?.toFixed(3) || 'N/A'}\n`;
        textContent += `  - Execution Time: ${report.executionTime || 'N/A'}ms\n`;
        textContent += `  - Created: ${new Date(report.createdAt).toLocaleString()}\n\n`;
      });
    }
    
    return {
      filename: `${filename}.txt`,
      contentType: 'text/plain',
      data: textContent
    };
  }
  
  /**
   * Export algorithm comparison as CSV
   */
  private exportComparisonAsCSV(data: any, filename: string): ExportResult {
    let csvContent = '';
    
    // Headers
    const headers = [
      'Algorithm',
      'Total Clusters',
      'Total Forces',
      'Average Silhouette Score',
      'Average Cohesion',
      'Average Separation'
    ];
    
    csvContent += headers.join(',') + '\n';
    
    // Data rows
    data.algorithmComparison.forEach((algo: any) => {
      const row = [
        `"${algo.algorithm}"`,
        algo.totalClusters,
        algo.totalForces,
        algo.averageQuality.silhouette.toFixed(3),
        algo.averageQuality.cohesion.toFixed(3),
        algo.averageQuality.separation.toFixed(3)
      ];
      csvContent += row.join(',') + '\n';
    });
    
    return {
      filename: `${filename}.csv`,
      contentType: 'text/csv',
      data: csvContent
    };
  }
  
  /**
   * Export quality timeline as CSV
   */
  private exportTimelineAsCSV(data: any, filename: string): ExportResult {
    let csvContent = '';
    
    // Headers
    const headers = [
      'Sequence',
      'Timestamp',
      'Algorithm',
      'Clusters Count',
      'Forces Processed',
      'Execution Time (ms)',
      'Average Silhouette',
      'Davies Bouldin Index',
      'Calinski Harabasz Index',
      'Total Inertia',
      'Recommended Clusters'
    ];
    
    csvContent += headers.join(',') + '\n';
    
    // Data rows
    data.qualityTimeline.forEach((entry: any) => {
      const row = [
        entry.sequence,
        `"${entry.timestamp}"`,
        `"${entry.algorithm}"`,
        entry.clustersCount,
        entry.forcesProcessed,
        entry.executionTime,
        entry.averageSilhouette.toFixed(3),
        entry.daviesBouldinIndex.toFixed(3),
        entry.calinskiHarabaszIndex.toFixed(3),
        entry.totalInertia.toFixed(3),
        entry.recommendedClusters
      ];
      csvContent += row.join(',') + '\n';
    });
    
    return {
      filename: `${filename}.csv`,
      contentType: 'text/csv',
      data: csvContent
    };
  }
}

// Export singleton instance
export const exportService = new ExportService();