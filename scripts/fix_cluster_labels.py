#!/usr/bin/env python3
"""
Fix cluster labels in database to use the 36 fixed cluster names
"""
import psycopg2
import os
import pickle

# Fixed cluster names mapping (IDs 0-35)
CLUSTER_NAMES = {
    0: "AI & Automation", 1: "Healthcare Tech", 2: "Sustainability", 3: "Financial Tech",
    4: "Social Dynamics", 5: "Smart Cities", 6: "Energy Systems", 7: "Digital Transformation",
    8: "Education Innovation", 9: "Manufacturing 4.0", 10: "Space & Defense", 11: "Food & Agriculture",
    12: "Materials Science", 13: "Quantum Computing", 14: "Biotechnology", 15: "Cybersecurity",
    16: "Transportation", 17: "Climate Action", 18: "Governance", 19: "Future of Work",
    20: "Consumer Tech", 21: "Media Evolution", 22: "Supply Chain", 23: "Data Economy",
    24: "Health & Wellness", 25: "Urban Development", 26: "Resource Management", 27: "Scientific Research",
    28: "Risk & Resilience", 29: "Human Enhancement", 30: "Digital Society", 31: "Environmental Tech",
    32: "Infrastructure", 33: "Global Systems", 34: "Emerging Markets", 35: "Innovation Ecosystems"
}

def main():
    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL environment variable not found")
        return False
    
    try:
        # Load features file to get the cluster mapping
        features_file = os.getenv('FEATURES_FILE', 'attached_assets/precomputed_features_1758013839680.pkl')
        print(f"📂 Loading features from: {features_file}")
        
        with open(features_file, 'rb') as f:
            features = pickle.load(f)
        
        cluster_labels = features.get('cluster_labels', [])
        ids = features.get('id', [])
        
        if not cluster_labels or not ids:
            print("❌ No cluster labels or IDs found in features file")
            return False
        
        print(f"✅ Loaded {len(cluster_labels)} cluster assignments")
        
        # Create mapping from force ID to cluster numeric ID
        force_to_cluster = {}
        for i, (force_id, cluster_id) in enumerate(zip(ids, cluster_labels)):
            if isinstance(cluster_id, (int, float)) and cluster_id is not None:
                force_to_cluster[str(force_id)] = int(cluster_id)
        
        print(f"📊 Created mapping for {len(force_to_cluster)} forces")
        
        # Connect to database
        print("🔗 Connecting to database...")
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Get all clusters and their force IDs
        cursor.execute("""
            SELECT id, label, force_ids 
            FROM clusters 
            WHERE force_ids IS NOT NULL AND array_length(force_ids, 1) > 0
            ORDER BY created_at
        """)
        
        clusters = cursor.fetchall()
        print(f"Found {len(clusters)} clusters with force assignments")
        
        updates = []
        for cluster_db_id, current_label, force_ids in clusters:
            if force_ids and len(force_ids) > 0:
                # Get cluster numeric ID from first force in cluster
                first_force_id = str(force_ids[0])
                if first_force_id in force_to_cluster:
                    cluster_numeric_id = force_to_cluster[first_force_id]
                    
                    # Get the fixed cluster name
                    new_label = CLUSTER_NAMES.get(cluster_numeric_id, f"Cluster {cluster_numeric_id}")
                    
                    if new_label != current_label:
                        updates.append((cluster_db_id, new_label, current_label, cluster_numeric_id))
        
        print(f"\n📝 Planned updates for {len(updates)} clusters:")
        for cluster_db_id, new_label, old_label, cluster_int_id in updates:
            print(f"  Cluster {cluster_int_id}: '{old_label}' → '{new_label}'")
        
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