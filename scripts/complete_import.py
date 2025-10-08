#!/usr/bin/env python3
"""
Resume and complete the ORION legacy dataset import
Designed to continue from current progress and finish the remaining records
"""
import os
import sys
import pandas as pd
import pickle
import psycopg2
from datetime import datetime
import time

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configuration
BATCH_SIZE = 1000  # Larger batches for efficiency
COMMIT_FREQUENCY = 5  # Commit more frequently

def connect_to_db():
    """Connect to PostgreSQL database using environment variables"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    
    return psycopg2.connect(database_url)

def load_legacy_data():
    """Load the complete dataset from legacy folder"""
    print("Loading legacy dataset...")
    
    # Load the main parquet file
    df = pd.read_parquet('legacy/old_orion/data/ORION_Scanning_DB_Updated.parquet')
    print(f"Loaded {len(df)} records from parquet file")
    
    # Load precomputed features for clustering
    try:
        with open('legacy/old_orion/data/precomputed_features.pkl', 'rb') as f:
            features = pickle.load(f)
        print(f"Loaded precomputed features with {len(features['cluster_labels'])} cluster assignments")
    except Exception as e:
        print(f"Warning: Could not load precomputed features: {e}")
        features = None
    
    return df, features

def get_import_status(conn):
    """Check current import status"""
    with conn.cursor() as cur:
        # Get current force count
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        current_count = cur.fetchone()[0]
        
        # Get project info
        cur.execute("SELECT id, name FROM projects WHERE is_default = true")
        default_project = cur.fetchone()
        
        # Get highest imported ID to determine resume point
        cur.execute("SELECT id FROM driving_forces ORDER BY id DESC LIMIT 1")
        result = cur.fetchone()
        last_imported_id = result[0] if result else None
        
        return current_count, default_project, last_imported_id

def resume_import(df, features, conn, resume_from_id=None):
    """Resume import from where we left off"""
    print("Starting resume import...")
    
    # Get current status
    current_count, default_project, last_imported_id = get_import_status(conn)
    project_id = default_project[0] if default_project else None
    
    print(f"Current status: {current_count} forces imported")
    print(f"Default project: {default_project[1] if default_project else 'None'} ({project_id})")
    
    if not project_id:
        print("Error: No default project found!")
        return 0
    
    # Determine starting point
    if last_imported_id and last_imported_id.startswith('force-'):
        try:
            last_imported_index = int(last_imported_id.split('-')[1]) - 1  # Convert to 0-based index
            start_index = last_imported_index + 1
        except ValueError:
            start_index = current_count
    else:
        start_index = current_count
    
    print(f"Resuming import from record {start_index + 1}")
    
    # Skip already imported records
    remaining_df = df.iloc[start_index:].copy()
    remaining_features = None
    if features and 'cluster_labels' in features:
        remaining_cluster_labels = features['cluster_labels'][start_index:]
        remaining_features = {
            'cluster_labels': remaining_cluster_labels,
            'cluster_titles': features['cluster_titles']
        }
    
    total_remaining = len(remaining_df)
    print(f"Remaining to import: {total_remaining} records")
    
    if total_remaining == 0:
        print("✅ Import already complete!")
        return 0
    
    # Get cluster mapping
    cluster_mapping = {}
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM clusters")
        cluster_rows = cur.fetchall()
        if cluster_rows and remaining_features:
            # Map cluster IDs
            for i, cluster_id in enumerate(set(remaining_features['cluster_labels'])):
                if i < len(cluster_rows):
                    cluster_mapping[cluster_id] = cluster_rows[i][0]
    
    # Force type mapping
    force_type_mapping = {
        'Megatrends': 'M',
        'Trends': 'T', 
        'Weak Signals': 'WS',
        'Wildcards': 'WC',
        'Signals': 'S'
    }
    
    # Import in batches
    total_batches = (total_remaining + BATCH_SIZE - 1) // BATCH_SIZE
    imported = 0
    
    print(f"Importing {total_remaining} records in {total_batches} batches of {BATCH_SIZE}")
    
    for batch_idx in range(total_batches):
        start_batch_idx = batch_idx * BATCH_SIZE
        end_batch_idx = min(start_batch_idx + BATCH_SIZE, total_remaining)
        batch_df = remaining_df.iloc[start_batch_idx:end_batch_idx]
        
        try:
            with conn.cursor() as cur:
                batch_records = []
                
                for df_idx, (_, row) in enumerate(batch_df.iterrows()):
                    # Calculate global index for cluster assignment
                    global_idx = start_index + start_batch_idx + df_idx
                    force_id = f"force-{row['ID']}"
                    
                    # Get cluster assignment
                    cluster_id = None
                    if remaining_features and len(remaining_features['cluster_labels']) > start_batch_idx + df_idx:
                        legacy_cluster = remaining_features['cluster_labels'][start_batch_idx + df_idx]
                        cluster_id = cluster_mapping.get(legacy_cluster)
                    
                    # Map driving force type
                    legacy_force_type = row['Driving Force']
                    mapped_force_type = force_type_mapping.get(legacy_force_type, 'S')
                    
                    # Clean up data
                    title = str(row.get('Title', '')).strip()[:500] if pd.notna(row.get('Title')) else 'Untitled'
                    description = str(row.get('Description', '')).strip()[:2000] if pd.notna(row.get('Description')) else ''
                    tags_str = str(row.get('Tags', '')).strip() if pd.notna(row.get('Tags')) else ''
                    tags_array = [tag.strip() for tag in tags_str.split(',') if tag.strip()] if tags_str else []
                    source = str(row.get('Source', '')).strip()[:500] if pd.notna(row.get('Source')) else ''
                    
                    # Build full text for search
                    full_text = f"{title} {description} {tags_str}".strip()
                    
                    # Default STEEP mapping
                    steep_mapping = {
                        'M': 'Social',
                        'T': 'Technological', 
                        'WS': 'Social',
                        'WC': 'Environmental',
                        'S': 'Technological'
                    }
                    steep = steep_mapping.get(mapped_force_type, 'Social')
                    
                    # Impact metrics
                    impact_score = None
                    if pd.notna(row.get('Level of Impact')):
                        impact_val = float(row['Level of Impact'])
                        impact_score = max(1.0, min(10.0, impact_val))
                    
                    # Time to market
                    ttm = str(row.get('Time to Market', '')).strip() if pd.notna(row.get('Time to Market')) else None
                    
                    batch_records.append((
                        force_id, project_id, title, mapped_force_type, steep, None, 
                        impact_score, ttm, 'Neutral', source, tags_array, full_text,
                        cluster_id, None, datetime.utcnow(), datetime.utcnow()
                    ))
                
                # Batch insert
                cur.executemany("""
                    INSERT INTO driving_forces (
                        id, project_id, title, type, steep, scope, impact, ttm, 
                        sentiment, source, tags, text, cluster_id, cluster_label,
                        created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """, batch_records)
                
                imported += len(batch_records)
                
                # Commit periodically
                if (batch_idx + 1) % COMMIT_FREQUENCY == 0:
                    conn.commit()
                    print(f"✅ Committed batch {batch_idx + 1}/{total_batches} - imported {imported}/{total_remaining} remaining records")
                
                # Progress update
                if (batch_idx + 1) % 10 == 0:
                    percent = (imported / total_remaining) * 100
                    total_so_far = current_count + imported
                    print(f"📊 Progress: {imported}/{total_remaining} remaining ({percent:.1f}%) - Total: {total_so_far}")
                    
        except Exception as e:
            print(f"❌ Error in batch {batch_idx}: {e}")
            conn.rollback()
            continue
    
    # Final commit
    conn.commit()
    print(f"✅ Import completed! Added {imported} new records")
    return imported

def verify_final_import(conn):
    """Verify the complete import"""
    print("\n=== FINAL VERIFICATION ===")
    
    with conn.cursor() as cur:
        # Check total counts
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        total_forces = cur.fetchone()[0]
        print(f"📊 Total driving forces in database: {total_forces}")
        
        # Check by type
        cur.execute("SELECT type, COUNT(*) FROM driving_forces GROUP BY type ORDER BY COUNT(*) DESC")
        force_counts = cur.fetchall()
        print("📈 Force distribution:")
        for force_type, count in force_counts:
            print(f"   {force_type}: {count:,}")
        
        # Check clusters
        cur.execute("SELECT COUNT(*) FROM clusters")
        cluster_count = cur.fetchone()[0]
        print(f"🏷️  Total clusters: {cluster_count}")
        
        # Expected vs actual
        expected_total = 29749
        if total_forces >= expected_total * 0.95:  # Allow 5% tolerance
            print(f"🎉 SUCCESS: Import appears complete! ({total_forces}/{expected_total})")
        else:
            print(f"⚠️  WARNING: Import may be incomplete ({total_forces}/{expected_total})")

def main():
    """Main resume import function"""
    start_time = time.time()
    
    try:
        # Load legacy data
        df, features = load_legacy_data()
        
        # Connect to database
        conn = connect_to_db()
        print("Connected to database")
        
        # Resume import from current progress
        imported_count = resume_import(df, features, conn)
        
        # Verify final state
        verify_final_import(conn)
        
        elapsed_time = time.time() - start_time
        print(f"\n🎉 Import completed in {elapsed_time:.1f} seconds!")
        print(f"📈 Added {imported_count} new records to database")
        
    except Exception as e:
        print(f"❌ Error during import: {e}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()