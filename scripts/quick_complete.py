#!/usr/bin/env python3
import os
import sys
import pandas as pd
import pickle
import psycopg2
from datetime import datetime
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# OPTIMIZED: Smaller batches for faster completion
BATCH_SIZE = 500  # Reduced from 1000
COMMIT_FREQUENCY = 2  # More frequent commits

def connect_to_db():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url)

def quick_resume_import():
    # Load just what we need
    df = pd.read_parquet("legacy/old_orion/data/ORION_Scanning_DB_Updated.parquet")
    
    with open("legacy/old_orion/data/precomputed_features.pkl", "rb") as f:
        features = pickle.load(f)
    
    conn = connect_to_db()
    
    # Get current status
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        current_count = cur.fetchone()[0]
        
        cur.execute("SELECT id FROM projects WHERE is_default = true")
        project_result = cur.fetchone()
        project_id = project_result[0] if project_result else None
        
        # Get last imported ID for resume point
        cur.execute("SELECT id FROM driving_forces WHERE id LIKE "force-%" ORDER BY CAST(SUBSTRING(id FROM 7) AS INTEGER) DESC LIMIT 1")
        result = cur.fetchone()
        if result:
            last_id_num = int(result[0].split("-")[1])
            start_index = last_id_num  # Next index to import
        else:
            start_index = 0
    
    print(f"📊 Current: {current_count:,} forces. Resuming from index {start_index}")
    
    # Skip already imported
    remaining_df = df.iloc[start_index:].copy()
    remaining_count = len(remaining_df)
    
    if remaining_count == 0:
        print("✅ Import complete!")
        return 0
    
    print(f"📈 Importing {remaining_count:,} remaining records in smaller batches")
    
    # Force type mapping
    force_type_mapping = {
        "Megatrends": "M", "Trends": "T", "Weak Signals": "WS",
        "Wildcards": "WC", "Signals": "S"
    }
    
    # Get cluster mapping
    cluster_mapping = {}
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM clusters ORDER BY id")
        cluster_rows = cur.fetchall()
        for i, (cluster_id,) in enumerate(cluster_rows):
            cluster_mapping[i] = cluster_id
    
    # Import in small batches
    total_batches = (remaining_count + BATCH_SIZE - 1) // BATCH_SIZE
    imported = 0
    
    for batch_idx in range(total_batches):
        if batch_idx >= 10:  # Limit to 10 batches per run to avoid timeout
            print(f"⏱️  Stopping at batch {batch_idx} to avoid timeout. Run again to continue.")
            break
            
        start_batch_idx = batch_idx * BATCH_SIZE
        end_batch_idx = min(start_batch_idx + BATCH_SIZE, remaining_count)
        batch_df = remaining_df.iloc[start_batch_idx:end_batch_idx]
        
        try:
            with conn.cursor() as cur:
                batch_records = []
                
                for df_idx, (_, row) in enumerate(batch_df.iterrows()):
                    global_idx = start_index + start_batch_idx + df_idx
                    force_id = f"force-{row["ID"]}"
                    
                    # Get cluster
                    cluster_id = None
                    if global_idx < len(features["cluster_labels"]):
                        legacy_cluster = features["cluster_labels"][global_idx]
                        cluster_id = cluster_mapping.get(legacy_cluster)
                    
                    # Clean data
                    title = str(row.get("Title", "")).strip()[:500] if pd.notna(row.get("Title")) else "Untitled"
                    description = str(row.get("Description", "")).strip()[:2000] if pd.notna(row.get("Description")) else ""
                    tags_str = str(row.get("Tags", "")).strip() if pd.notna(row.get("Tags")) else ""
                    tags_array = [tag.strip() for tag in tags_str.split(",") if tag.strip()] if tags_str else []
                    source = str(row.get("Source", "")).strip()[:500] if pd.notna(row.get("Source")) else ""
                    full_text = f"{title} {description} {tags_str}".strip()
                    
                    # Map type
                    legacy_force_type = row["Driving Force"]
                    mapped_force_type = force_type_mapping.get(legacy_force_type, "S")
                    
                    # STEEP
                    steep_mapping = {"M": "Social", "T": "Technological", "WS": "Social", "WC": "Environmental", "S": "Technological"}
                    steep = steep_mapping.get(mapped_force_type, "Social")
                    
                    # Impact
                    impact_score = None
                    if pd.notna(row.get("Level of Impact")):
                        impact_val = float(row["Level of Impact"])
                        impact_score = max(1.0, min(10.0, impact_val))
                    
                    ttm = str(row.get("Time to Market", "")).strip() if pd.notna(row.get("Time to Market")) else None
                    
                    batch_records.append((
                        force_id, project_id, title, mapped_force_type, steep, None, 
                        impact_score, ttm, "Neutral", source, tags_array, full_text,
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
                
                # Commit frequently
                if (batch_idx + 1) % COMMIT_FREQUENCY == 0:
                    conn.commit()
                    print(f"✅ Batch {batch_idx + 1}/{total_batches}: +{len(batch_records)} records (total: {current_count + imported:,})")
                
        except Exception as e:
            print(f"❌ Error in batch {batch_idx}: {e}")
            conn.rollback()
            continue
    
    # Final commit
    conn.commit()
    
    # Status update
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        final_count = cur.fetchone()[0]
        
    print(f"
📊 Import session complete!")
    print(f"📈 Added: {imported:,} records")
    print(f"📋 Total in database: {final_count:,}/29,749")
    completion_pct = (final_count / 29749) * 100
    print(f"🎯 Completion: {completion_pct:.1f}%")
    
    if final_count >= 29749 * 0.95:
        print(f"🎉 SUCCESS: Import appears complete!")
    else:
        remaining = 29749 - final_count
        print(f"⏳ Run script again to import remaining {remaining:,} records")
    
    conn.close()
    return imported

if __name__ == "__main__":
    quick_resume_import()
