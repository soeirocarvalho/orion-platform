#!/usr/bin/env python3
"""
Import non-curated Signals from Excel file into ORION database
Handles the large 26,884 signals dataset with proper batching
"""

import pandas as pd
import psycopg2
import psycopg2.extras
import os
import sys
import uuid
from datetime import datetime
import argparse

def connect_to_database():
    """Connect to the database using environment variables"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('PGHOST', 'localhost'),
            port=os.getenv('PGPORT', 5432),
            database=os.getenv('PGDATABASE', 'replit'),
            user=os.getenv('PGUSER', 'replit'),
            password=os.getenv('PGPASSWORD', '')
        )
        return conn
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        raise

def validate_environment():
    """Validate that the import is allowed"""
    if not os.getenv('ORION_SIGNALS_IMPORT_ALLOW'):
        print("⚠️  WARNING: This will import 26,884 non-curated Signals!")
        print("To proceed, set: export ORION_SIGNALS_IMPORT_ALLOW=1")
        print("Or use --dry-run to test first")
        return False
    return True

def import_signals(excel_file, dry_run=False, batch_size=1000, project_id=None):
    """Import the Signals dataset in batches"""
    
    print(f"🚀 ORION Signals Dataset Importer")
    print("=" * 50)
    
    if not dry_run and not validate_environment():
        return False
    
    if not os.path.exists(excel_file):
        print(f"❌ Excel file not found: {excel_file}")
        return False
    
    # Connect to database
    conn = connect_to_database()
    
    try:
        with conn.cursor() as cur:
            # Get or create project for signals
            if not project_id:
                # Look for existing Signals project or use the current default
                cur.execute("""
                    SELECT id FROM projects 
                    WHERE name LIKE '%Signals%' OR name LIKE '%Signal%' 
                    ORDER BY created_at DESC LIMIT 1
                """)
                result = cur.fetchone()
                
                if result:
                    project_id = result[0]
                    print(f"📁 Using existing project: {project_id}")
                else:
                    # Use the most recent project
                    cur.execute("SELECT id FROM projects ORDER BY created_at DESC LIMIT 1")
                    result = cur.fetchone()
                    if result:
                        project_id = result[0]
                        print(f"📁 Using current project: {project_id}")
                    else:
                        # Create new project
                        new_project_id = str(uuid.uuid4())
                        cur.execute("""
                            INSERT INTO projects (id, name, description, is_default, created_at, updated_at)
                            VALUES (%s, %s, %s, %s, NOW(), NOW())
                        """, (new_project_id, 'Signals Dataset', 'Non-curated signals from comprehensive dataset', False))
                        project_id = new_project_id
                        print(f"📁 Created new signals project: {project_id}")
                        
                        if not dry_run:
                            conn.commit()
        
        # Read Signals sheet (handle large dataset)
        print(f"📂 Loading Signals sheet...")
        
        if dry_run:
            # For dry run, just read first few rows
            signals_df = pd.read_excel(excel_file, sheet_name='Signals', nrows=batch_size * 3)
            print(f"   DRY RUN: Testing with {len(signals_df)} sample records")
        else:
            # For real import, read all data
            signals_df = pd.read_excel(excel_file, sheet_name='Signals')
            print(f"✅ Loaded {len(signals_df)} total signals")
        
        # Process in chunks
        total_imported = 0
        chunk_num = 0
        
        for start_idx in range(0, len(signals_df), batch_size):
            chunk_num += 1
            end_idx = min(start_idx + batch_size, len(signals_df))
            chunk_df = signals_df.iloc[start_idx:end_idx]
            
            print(f"📦 Processing chunk {chunk_num} ({len(chunk_df)} records)...")
            
            if dry_run:
                print(f"   DRY RUN: Would import {len(chunk_df)} signals")
                total_imported += len(chunk_df)
                continue
            
            # Process this chunk
            records = []
            for idx, row in chunk_df.iterrows():
                # Map STEEP from dimension if available
                dimension = str(row['dimension']) if pd.notna(row['dimension']) else 'technological'
                steep_value = map_dimension_to_steep(dimension)
                
                record = {
                    'id': f"signal_{row['ID']}",  # Use the original ID with prefix
                    'project_id': project_id,
                    'title': str(row['Title']) if pd.notna(row['Title']) else 'Untitled Signal',
                    'text': str(row['Description']) if pd.notna(row['Description']) else '',
                    'type': 'S',  # Signal type
                    'steep': steep_value,
                    'scope': 'global',
                    'impact': 5.0,  # Default impact for signals
                    'ttm': str(row['Time to Market']) if pd.notna(row['Time to Market']) else 'Medium',
                    'sentiment': 'neutral',
                    'source': str(row['Source']) if pd.notna(row['Source']) else '',
                    'tags': [str(row['Tags'])] if pd.notna(row['Tags']) and str(row['Tags']).strip() else [],
                    'feasibility': 5.0,  # Default feasibility
                    'urgency': 5.0,  # Default urgency
                    'dimension': dimension,
                    # Radar visualization data
                    'magnitude': float(row['magnitude']) if pd.notna(row['magnitude']) else None,
                    'distance': float(row['distance']) if pd.notna(row['distance']) else None,
                    'color_hex': str(row['color_hex']) if pd.notna(row['color_hex']) else None
                }
                records.append(record)
            
            # Batch insert this chunk
            with conn.cursor() as cur:
                insert_query = """
                    INSERT INTO driving_forces (
                        id, project_id, title, text, type, steep, scope,
                        impact, ttm, sentiment, source, tags,
                        feasibility, urgency, dimension,
                        magnitude, distance, color_hex, created_at, updated_at
                    ) VALUES %s
                    ON CONFLICT (id) DO NOTHING
                """
                
                values = [
                    (
                        r['id'], r['project_id'], r['title'], r['text'], r['type'],
                        r['steep'], r['scope'], r['impact'], r['ttm'], r['sentiment'],
                        r['source'], r['tags'], r['feasibility'], r['urgency'], r['dimension'],
                        r['magnitude'], r['distance'], r['color_hex'],
                        datetime.now(), datetime.now()
                    ) for r in records
                ]
                
                psycopg2.extras.execute_values(
                    cur, insert_query, values, template=None, page_size=500
                )
                
                conn.commit()
                total_imported += len(records)
                print(f"✅ Imported chunk {chunk_num}: {len(records)} signals (total: {total_imported})")
        
        print(f"\n🎉 SUCCESS!")
        if dry_run:
            print(f"📊 DRY RUN: Would import approximately {total_imported} signals")
        else:
            print(f"📊 Imported {total_imported} signals successfully")
            print(f"🆔 Project ID: {project_id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during import: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def map_dimension_to_steep(dimension):
    """Map radar dimension to STEEP category"""
    if not dimension or str(dimension).lower() == 'nan':
        return 'technological'
    
    dimension_lower = str(dimension).lower()
    
    # Map common dimensions to STEEP categories
    if any(term in dimension_lower for term in ['social', 'society', 'culture', 'demographic']):
        return 'social'
    elif any(term in dimension_lower for term in ['tech', 'digital', 'ai', 'cyber', 'data']):
        return 'technological'
    elif any(term in dimension_lower for term in ['economic', 'finance', 'market', 'business']):
        return 'economic'
    elif any(term in dimension_lower for term in ['environment', 'climate', 'energy', 'sustain']):
        return 'environmental'
    elif any(term in dimension_lower for term in ['politic', 'government', 'policy', 'regulation']):
        return 'political'
    else:
        return 'technological'  # Default

def main():
    parser = argparse.ArgumentParser(description='Import ORION Signals dataset')
    parser.add_argument('excel_file', help='Path to the Excel file with Signals sheet')
    parser.add_argument('--dry-run', action='store_true', help='Test run without importing')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for processing')
    parser.add_argument('--project-id', help='Specific project ID to import into')
    
    args = parser.parse_args()
    
    success = import_signals(
        excel_file=args.excel_file,
        dry_run=args.dry_run,
        batch_size=args.batch_size,
        project_id=args.project_id
    )
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()