#!/usr/bin/env python3
"""
Simple optimized script to finish the remaining import
Uses small batches with frequent commits to avoid timeouts
"""
import os
import sys
import pandas as pd
import pickle
import psycopg2
from datetime import datetime

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    print("🚀 Starting optimized import to finish remaining records...")
    
    # Connect to database
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    
    # Check current status
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        current_count = cur.fetchone()[0]
        
        cur.execute("SELECT id FROM projects WHERE is_default = true")
        project_result = cur.fetchone()
        project_id = project_result[0] if project_result else None
        
        print(f"📊 Current database: {current_count:,} driving forces")
        print(f"🎯 Target: 29,749 (remaining: {29749 - current_count:,})")
    
    if current_count >= 29749:
        print("✅ Import already complete!")
        return
    
    # Load dataset
    print("📥 Loading legacy dataset...")
    df = pd.read_parquet('legacy/old_orion/data/ORION_Scanning_DB_Updated.parquet')
    
    with open('legacy/old_orion/data/precomputed_features.pkl', 'rb') as f:
        features = pickle.load(f)
    
    # Determine resume point by finding highest imported ID
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM driving_forces WHERE id LIKE 'force-%' ORDER BY CAST(SUBSTRING(id FROM 7) AS INTEGER) DESC LIMIT 1")
        result = cur.fetchone()
        
        if result:
            last_id_num = int(result[0].split('-')[1])
            start_index = last_id_num  # Next index to import
        else:
            start_index = 0
    
    print(f"📍 Resuming from record index {start_index}")
    
    # Skip already imported records
    remaining_df = df.iloc[start_index:].copy()
    remaining_count = len(remaining_df)
    
    if remaining_count == 0:
        print("✅ All records already imported!")
        return
    
    print(f"📈 Processing {remaining_count:,} remaining records")
    
    # Force type mapping
    force_type_mapping = {
        'Megatrends': 'M',
        'Trends': 'T', 
        'Weak Signals': 'WS',
        'Wildcards': 'WC',
        'Signals': 'S'
    }
    
    # Get cluster mapping
    cluster_mapping = {}
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM clusters ORDER BY id")
        cluster_rows = cur.fetchall()
        for i, (cluster_id,) in enumerate(cluster_rows):
            cluster_mapping[i] = cluster_id
    
    # Process in small batches (limit to avoid timeout)
    BATCH_SIZE = 500
    MAX_BATCHES = 8  # Process max 4000 records per run
    
    imported_this_run = 0
    batch_count = 0
    
    for batch_start in range(0, remaining_count, BATCH_SIZE):
        if batch_count >= MAX_BATCHES:
            print(f"⏱️  Processed {MAX_BATCHES} batches. Run again to continue.")
            break
            
        batch_end = min(batch_start + BATCH_SIZE, remaining_count)
        batch_df = remaining_df.iloc[batch_start:batch_end]
        
        print(f"📦 Processing batch {batch_count + 1}: records {batch_start + 1}-{batch_end}")
        
        try:
            with conn.cursor() as cur:
                batch_records = []
                
                for df_idx, (_, row) in enumerate(batch_df.iterrows()):
                    global_idx = start_index + batch_start + df_idx
                    force_id = f"force-{row['ID']}"
                    
                    # Get cluster assignment
                    cluster_id = None
                    if global_idx < len(features['cluster_labels']):
                        legacy_cluster = features['cluster_labels'][global_idx]
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
                    full_text = f"{title} {description} {tags_str}".strip()
                    
                    # STEEP mapping
                    steep_mapping = {'M': 'Social', 'T': 'Technological', 'WS': 'Social', 'WC': 'Environmental', 'S': 'Technological'}
                    steep = steep_mapping.get(mapped_force_type, 'Social')
                    
                    # Impact score
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
                
                # Insert batch
                cur.executemany("""
                    INSERT INTO driving_forces (
                        id, project_id, title, type, steep, scope, impact, ttm, 
                        sentiment, source, tags, text, cluster_id, cluster_label,
                        created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """, batch_records)
                
                # Commit after each batch
                conn.commit()
                
                imported_this_run += len(batch_records)
                batch_count += 1
                
                print(f"✅ Batch {batch_count} complete: +{len(batch_records)} records")
                
        except Exception as e:
            print(f"❌ Error in batch {batch_count + 1}: {e}")
            conn.rollback()
            continue
    
    # Final status
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        final_count = cur.fetchone()[0]
    
    print(f"\n📊 Import session summary:")
    print(f"📈 Added this run: {imported_this_run:,} records")
    print(f"📋 Total in database: {final_count:,}/29,749")
    
    completion_pct = (final_count / 29749) * 100
    print(f"🎯 Overall completion: {completion_pct:.1f}%")
    
    if final_count >= 29749 * 0.98:  # Allow 2% tolerance
        print("🎉 SUCCESS: Import is essentially complete!")
    else:
        remaining = 29749 - final_count
        print(f"⏳ Run script again to import remaining {remaining:,} records")
    
    conn.close()

if __name__ == "__main__":
    main()