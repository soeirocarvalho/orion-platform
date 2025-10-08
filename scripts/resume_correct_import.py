#!/usr/bin/env python3
"""
Resume-capable import script for exactly 29,749 driving forces
This continues from where it left off without clearing existing data
"""
import os
import sys
import pandas as pd
import pickle
import psycopg2
from datetime import datetime

def main():
    print("🔄 RESUME CORRECT IMPORT - 29,749 Records")
    print("=" * 50)
    
    # Connect to database
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    
    # Check current state
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM driving_forces")
        current_count = cur.fetchone()[0]
        
        cur.execute("SELECT id FROM projects WHERE is_default = true")
        project_result = cur.fetchone()
        project_id = project_result[0] if project_result else 'legacy-full-dataset'
        
        print(f"📊 Current: {current_count:,}/29,749 records")
        print(f"📁 Project: {project_id}")
    
    if current_count >= 29749:
        print("✅ Import already complete!")
        return
    
    # Load dataset
    print("\n📥 Loading source data...")
    df = pd.read_parquet('legacy/old_orion/data/ORION_Scanning_DB_Updated.parquet')
    
    with open('legacy/old_orion/data/precomputed_features.pkl', 'rb') as f:
        features = pickle.load(f)
    
    print(f"📊 Source: {len(df):,} records")
    
    # Determine resume point
    imported_ids = set()
    if current_count > 0:
        print("🔍 Finding resume point...")
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM driving_forces WHERE id LIKE 'force-%'")
            imported_ids = {row[0] for row in cur.fetchall()}
        
        print(f"📋 Found {len(imported_ids):,} existing force IDs")
    
    # Prepare records to import (skip already imported)
    to_import = []
    for idx, (_, row) in enumerate(df.iterrows()):
        force_id = f"force-{row['ID']}"
        if force_id not in imported_ids:
            to_import.append((idx, row))
    
    remaining = len(to_import)
    print(f"📈 Need to import: {remaining:,} remaining records")
    
    if remaining == 0:
        print("✅ All records already imported!")
        return
    
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
    
    # Import in batches
    BATCH_SIZE = 500
    imported_this_run = 0
    
    print(f"\n🚀 Starting import of {remaining:,} records...")
    
    for batch_start in range(0, remaining, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, remaining)
        batch_data = to_import[batch_start:batch_end]
        
        print(f"📦 Batch {batch_start//BATCH_SIZE + 1}: records {batch_start + 1}-{batch_end}")
        
        try:
            with conn.cursor() as cur:
                batch_records = []
                
                for original_idx, row in batch_data:
                    force_id = f"force-{row['ID']}"
                    
                    # Get cluster assignment
                    cluster_id = None
                    if original_idx < len(features['cluster_labels']):
                        legacy_cluster = features['cluster_labels'][original_idx]
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
                        try:
                            impact_val = float(row['Level of Impact'])
                            impact_score = max(1.0, min(10.0, impact_val))
                        except:
                            pass
                    
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
                
                conn.commit()
                imported_this_run += len(batch_records)
                new_total = current_count + imported_this_run
                
                print(f"   ✅ +{len(batch_records)} records (total: {new_total:,}/29,749)")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            conn.rollback()
            continue
    
    # Final status
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM driving_forces')
        final_count = cur.fetchone()[0]
        
        cur.execute('SELECT type, COUNT(*) FROM driving_forces GROUP BY type ORDER BY type')
        final_distribution = cur.fetchall()
    
    print(f"\n📊 IMPORT SESSION COMPLETE")
    print(f"📈 Added this run: {imported_this_run:,}")
    print(f"📋 Total in database: {final_count:,}/29,749")
    
    if final_distribution:
        print("\n📊 Current distribution:")
        actual = {}
        for force_type, count in final_distribution:
            actual[force_type] = count
            print(f"   {force_type}: {count:,}")
    
    # Check against expected if complete
    if final_count >= 29749:
        expected = {'S': 26883, 'T': 2185, 'WS': 458, 'WC': 203, 'M': 20}
        
        print("\n✅ FINAL VERIFICATION:")
        all_correct = True
        for force_type, expected_count in expected.items():
            actual_count = actual.get(force_type, 0)
            status = '✅' if actual_count == expected_count else '❌'
            if actual_count != expected_count:
                all_correct = False
            print(f"{status} {force_type}: {actual_count:,} (expected {expected_count:,})")
        
        if all_correct:
            print("\n🎉 SUCCESS: All 29,749 driving forces imported correctly!")
        else:
            print(f"\n❌ Issue with distribution")
    else:
        remaining = 29749 - final_count
        print(f"\n⏳ Run script again to import remaining {remaining:,} records")
    
    conn.close()

if __name__ == "__main__":
    main()