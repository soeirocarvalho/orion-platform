// Test script to populate all ORION clusters directly
import { ImportService } from './server/services/importService.js';

const projectId = '6a20338e-cb24-4fab-a234-368833afeb45';

console.log('🚀 Starting comprehensive ORION cluster population...');
console.log('Project ID:', projectId);

try {
  const result = await ImportService.populateAllOrionClusters(projectId);
  
  console.log('\n🎉 POPULATION RESULTS:');
  console.log('='.repeat(50));
  console.log('Success:', result.success);
  console.log('Clusters Populated:', result.clustersPopulated);
  console.log('Total Forces Assigned:', result.totalForcesAssigned);
  console.log('Message:', result.message);
  
  if (result.results && result.results.length > 0) {
    console.log('\n📊 DETAILED RESULTS:');
    console.log('-'.repeat(80));
    result.results.forEach((cluster, index) => {
      console.log(`${index + 1}. ${cluster.cluster}: ${cluster.forces} forces (${cluster.keywords.length} keywords)`);
    });
    
    // Show top 10 most populated clusters
    const topClusters = result.results
      .filter(c => c.forces > 0)
      .sort((a, b) => b.forces - a.forces)
      .slice(0, 10);
      
    if (topClusters.length > 0) {
      console.log('\n🏆 TOP 10 POPULATED CLUSTERS:');
      console.log('-'.repeat(50));
      topClusters.forEach((cluster, index) => {
        console.log(`${index + 1}. ${cluster.cluster}: ${cluster.forces} forces`);
      });
    }
  }
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error during population:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}