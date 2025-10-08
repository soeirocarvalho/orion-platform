#!/usr/bin/env python3
"""
Clean re-import script to load exactly 29,749 driving forces
This will clear the current data and import the correct dataset
"""
import os
import sys
import pandas as pd
import pickle
import psycopg2
from datetime import datetime

def main():
    print("🧹 FIXING ORION DATABASE - Clean Re-import")
    print("=" * 50)
    
    # Connect to database
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    
    # First, clear existing driving forces
    print("🗑️  Clearing existing driving forces...")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM driving_forces")
        deleted_count = cur.rowcount
        print(f"   Deleted {deleted_count:,} existing records")
        conn.commit()
    
    # Load the correct dataset
    print("\n📥 Loading legacy dataset...")
    df = pd.read_parquet('legacy/old_orion/data/ORION_Scanning_DB_Updated.parquet')
    
    with open('legacy/old_orion/data/precomputed_features.pkl', 'rb') as f:
        features = pickle.load(f)
    
    print(f"📊 Source data: {len(df):,} records")
    
    # Verify correct distribution
    driving_force_counts = df['Driving Force'].value_counts()
    print("\n📋 Source distribution:")
    for force_type, count in driving_force_counts.items():
        print(f"   {force_type}: {count:,}")
    
    # Get default project
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM projects WHERE is_default = true")
        project_result = cur.fetchone()
        project_id = project_result[0] if project_result else 'legacy-full-dataset'
    
    print(f"\n📁 Target project: {project_id}")
    
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
    
    print(f"\n🏷️  Available clusters: {len(cluster_mapping)}")
    
    # Import in batches
    BATCH_SIZE = 500
    total_imported = 0
    
    print(f"\n🚀 Starting clean import...")
    
    for batch_start in range(0, len(df), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(df))
        batch_df = df.iloc[batch_start:batch_end]
        
        print(f"📦 Batch {batch_start//BATCH_SIZE + 1}: records {batch_start + 1}-{batch_end}")
        
        try:
            with conn.cursor() as cur:
                batch_records = []
                
                for df_idx, (_, row) in enumerate(batch_df.iterrows()):
                    global_idx = batch_start + df_idx
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
                """, batch_records)
                
                conn.commit()
                total_imported += len(batch_records)
                
                print(f"   ✅ +{len(batch_records)} records (total: {total_imported:,})")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            conn.rollback()
            continue
    
    # Final verification
    print(f"\n🎯 IMPORT COMPLETE!")
    
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM driving_forces')
        final_count = cur.fetchone()[0]
        
        cur.execute('SELECT type, COUNT(*) FROM driving_forces GROUP BY type ORDER BY type')
        final_distribution = cur.fetchall()
    
    print(f"📊 Final count: {final_count:,}")
    print("\n📋 Final distribution:")
    for force_type, count in final_distribution:
        print(f"   {force_type}: {count:,}")
    
    # Check against expected
    expected = {'S': 26883, 'T': 2185, 'WS': 458, 'WC': 203, 'M': 20}
    actual = dict(final_distribution)
    
    print("\n✅ VERIFICATION:")
    all_correct = True
    for force_type, expected_count in expected.items():
        actual_count = actual.get(force_type, 0)
        status = '✅' if actual_count == expected_count else '❌'
        if actual_count != expected_count:
            all_correct = False
        print(f"{status} {force_type}: {actual_count:,} (expected {expected_count:,})")
    
    if all_correct and final_count == 29749:
        print("\n🎉 SUCCESS: All driving forces imported correctly!")
    else:
        print(f"\n❌ Issue: Expected 29,749 total but got {final_count:,}")
    
    conn.close()

if __name__ == "__main__":
    main()