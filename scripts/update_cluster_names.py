#!/usr/bin/env python3
"""
Update existing cluster names in database to use fixed 36-cluster mapping
"""
import psycopg2
import os
import sys

# Fixed cluster names mapping (IDs 0-35)
CLUSTER_NAMES = {
    0: "AI & Automation",
    1: "Healthcare Tech", 
    2: "Sustainability",
    3: "Financial Tech",
    4: "Social Dynamics",
    5: "Smart Cities",
    6: "Energy Systems",
    7: "Digital Transformation",
    8: "Education Innovation",
    9: "Manufacturing 4.0",
    10: "Space & Defense",
    11: "Food & Agriculture",
    12: "Materials Science",
    13: "Quantum Computing",
    14: "Biotechnology",
    15: "Cybersecurity",
    16: "Transportation",
    17: "Climate Action",
    18: "Governance",
    19: "Future of Work",
    20: "Consumer Tech",
    21: "Media Evolution",
    22: "Supply Chain",
    23: "Data Economy",
    24: "Health & Wellness",
    25: "Urban Development",
    26: "Resource Management",
    27: "Scientific Research",
    28: "Risk & Resilience",
    29: "Human Enhancement",
    30: "Digital Society",
    31: "Environmental Tech",
    32: "Infrastructure",
    33: "Global Systems",
    34: "Emerging Markets",
    35: "Innovation Ecosystems"
}

def get_cluster_name(cluster_id: int) -> str:
    """Get cluster name by ID, with fallback for unknown IDs"""
    return CLUSTER_NAMES.get(cluster_id, f"Cluster {cluster_id}")

def main():
    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL environment variable not found")
        return False
    
    try:
        # Connect to database
        print("🔗 Connecting to database...")
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Get all clusters with force IDs to analyze cluster mapping
        print("📊 Analyzing existing clusters...")
        cursor.execute("""
            SELECT id, project_id, label, force_ids 
            FROM clusters 
            ORDER BY created_at
        """)
        
        clusters = cursor.fetchall()
        print(f"Found {len(clusters)} clusters in database")
        
        if not clusters:
            print("No clusters found to update")
            return True
        
        # Load cluster labels from features to map cluster IDs
        print("🔍 Loading force cluster assignments...")
        cursor.execute("""
            SELECT id, cluster_label 
            FROM driving_forces 
            WHERE cluster_label IS NOT NULL
            LIMIT 1000
        """)
        
        force_cluster_mapping = dict(cursor.fetchall())
        print(f"Found cluster assignments for {len(force_cluster_mapping)} forces")
        
        # Group forces by their cluster labels to understand mapping
        cluster_id_to_forces = {}
        for force_id, cluster_label in force_cluster_mapping.items():
            if cluster_label not in cluster_id_to_forces:
                cluster_id_to_forces[cluster_label] = []
            cluster_id_to_forces[cluster_label].append(force_id)
        
        print(f"Found {len(cluster_id_to_forces)} unique cluster labels in forces")
        
        # Map database cluster IDs to force cluster labels
        updates = []
        for cluster_db_id, project_id, current_label, force_ids in clusters:
            if force_ids and len(force_ids) > 0:
                # Get cluster label from first force in cluster
                first_force_id = force_ids[0]
                if first_force_id in force_cluster_mapping:
                    cluster_numeric_id = force_cluster_mapping[first_force_id]
                    
                    # Get the fixed cluster name
                    if isinstance(cluster_numeric_id, (int, str)):
                        try:
                            cluster_int_id = int(float(cluster_numeric_id))  # Handle both int and float strings
                            new_label = get_cluster_name(cluster_int_id)
                            
                            if new_label != current_label:
                                updates.append((cluster_db_id, new_label, current_label, cluster_int_id))
                        except (ValueError, TypeError):
                            print(f"⚠️  Invalid cluster ID for cluster {cluster_db_id}: {cluster_numeric_id}")
        
        print(f"\n📝 Planned updates for {len(updates)} clusters:")
        for cluster_db_id, new_label, old_label, cluster_int_id in updates[:10]:  # Show first 10
            print(f"  Cluster {cluster_int_id}: '{old_label}' → '{new_label}'")
        
        if len(updates) > 10:
            print(f"  ... and {len(updates) - 10} more clusters")
        
        # Apply updates
        if updates:
            print(f"\n🔧 Updating {len(updates)} cluster names...")
            for cluster_db_id, new_label, old_label, cluster_int_id in updates:
                cursor.execute(
                    "UPDATE clusters SET label = %s WHERE id = %s",
                    (new_label, cluster_db_id)
                )
            
            # Commit changes
            conn.commit()
            print(f"✅ Successfully updated {len(updates)} cluster names")
        else:
            print("No updates needed - all clusters already have correct names")
        
        # Verify updates
        cursor.execute("SELECT label, COUNT(*) FROM clusters GROUP BY label ORDER BY label")
        final_clusters = cursor.fetchall()
        
        print(f"\n📊 Final cluster distribution:")
        for label, count in final_clusters:
            print(f"  {label}: {count} clusters")
        
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Error updating cluster names: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)