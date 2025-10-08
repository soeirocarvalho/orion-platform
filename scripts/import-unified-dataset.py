#!/usr/bin/env python3
"""
Import Unified ORION Dataset
Imports modified unified dataset back into clean database projects.
Handles both base data and radar visualization columns.
"""

import pandas as pd
import psycopg2
import psycopg2.extras
import os
import sys
import argparse
from datetime import datetime
import json

def connect_to_db():
    """Connect to PostgreSQL database using DATABASE_URL"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url)

def clear_existing_data(conn, dry_run=False):
    """Clear existing data and create clean project"""
    if dry_run:
        print("🔍 DRY RUN: Would clear existing data...")
        return "dry-run-project-id"
    
    # Safety check: Require explicit environment variable for destructive operations
    if not os.environ.get('ORION_IMPORT_ALLOW'):
        raise ValueError("SAFETY: Set ORION_IMPORT_ALLOW=1 environment variable to enable destructive operations")
    
    print("🧹 Clearing existing data...")
    
    with conn.cursor() as cur:
        # Check database environment (avoid production accidents)
        cur.execute("SELECT current_database()")
        db_name = cur.fetchone()[0]
        if 'prod' in db_name.lower() or 'production' in db_name.lower():
            raise ValueError(f"SAFETY: Refusing to clear production database: {db_name}")
        
        # Clear in proper order due to foreign key constraints
        cur.execute("DELETE FROM reports")
        cur.execute("DELETE FROM workspaces") 
        cur.execute("DELETE FROM clustering_reports")
        cur.execute("DELETE FROM saved_searches")  # Clear saved searches first
        cur.execute("DELETE FROM driving_forces")
        cur.execute("DELETE FROM clusters")
        
        # Clear projects except system ones
        cur.execute("DELETE FROM projects WHERE name NOT LIKE '%Processing%'")
        
        # Create new clean project with simple ID generation
        import uuid
        project_uuid = str(uuid.uuid4())
        
        cur.execute("""
            INSERT INTO projects (id, name, description, is_default, created_at, updated_at)
            VALUES (%s, %s, %s, %s, NOW(), NOW())
            RETURNING id
        """, (project_uuid, 'Unified Dataset', 'Clean unified dataset from local editing', True))
        project_id = cur.fetchone()[0]
        
        print(f"✅ Created clean project: {project_id}")
        
    conn.commit()
    return project_id

def load_unified_dataset(file_path):
    """Load the modified unified dataset"""
    print(f"📂 Loading unified dataset from: {file_path}")
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Detect file format and load
    if file_path.endswith('.xlsx'):
        df = pd.read_excel(file_path)
    elif file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    else:
        raise ValueError("File must be .csv or .xlsx format")
    
    print(f"✅ Loaded {len(df):,} records")
    print(f"📋 Columns: {len(df.columns)}")
    
    return df

def validate_dataset(df):
    """Validate the dataset structure"""
    print("🔍 Validating dataset structure...")
    
    required_columns = ['ID', 'Title', 'Description', 'Driving Force']
    missing_columns = [col for col in required_columns if col not in df.columns]
    
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")
    
    # Check for empty titles
    empty_titles = df['Title'].isna().sum()
    if empty_titles > 0:
        print(f"⚠️  Warning: {empty_titles} records have empty titles")
    
    # Force type mapping
    force_type_mapping = {
        'Megatrends': 'M',
        'Trends': 'T', 
        'Weak Signals': 'WS',
        'Wildcards': 'WC',
        'Signals': 'S'
    }
    
    df['type_code'] = df['Driving Force'].map(force_type_mapping)
    invalid_types = df['type_code'].isna().sum()
    if invalid_types > 0:
        print(f"⚠️  Warning: {invalid_types} records have invalid force types")
        # Fill with 'S' for signals as default
        df['type_code'] = df['type_code'].fillna('S')
    
    print("✅ Dataset validation complete")
    return df

def import_driving_forces(conn, df, project_id):
    """Import driving forces into database"""
    print("💾 Importing driving forces...")
    
    # Prepare data for insertion
    records = []
    for idx, row in df.iterrows():
        # Map STEEP dimension
        steep_mapping = {
            'Social': 'social',
            'Technological': 'technological', 
            'Economic': 'economic',
            'Environmental': 'environmental',
            'Political': 'political'
        }
        
        # Get STEEP from Tags or dimension column
        steep_value = None
        if 'dimension' in row and pd.notna(row['dimension']):
            steep_value = steep_mapping.get(row['dimension'], 'technological')
        elif 'Tags' in row and pd.notna(row['Tags']):
            # Try to extract STEEP from tags
            tags_lower = str(row['Tags']).lower()
            for steep_key, steep_val in steep_mapping.items():
                if steep_key.lower() in tags_lower:
                    steep_value = steep_val
                    break
        
        if not steep_value:
            steep_value = 'technological'  # Default
        
        record = {
            'id': f"unified_{idx + 1}",  # Generate unique ID
            'project_id': project_id,
            'title': str(row['Title']) if pd.notna(row['Title']) else '',
            'text': str(row['Description']) if pd.notna(row['Description']) else '',  # Database uses 'text' not 'description'
            'type': row['type_code'],
            'steep': steep_value,
            'scope': 'global',  # Default scope
            'impact': float(row['Level of Impact']) if 'Level of Impact' in row and pd.notna(row['Level of Impact']) else 5.0,
            'ttm': str(row['Time to Market']) if 'Time to Market' in row and pd.notna(row['Time to Market']) else 'Medium',
            'sentiment': 'neutral',  # Default sentiment
            'source': str(row['Source']) if 'Source' in row and pd.notna(row['Source']) else '',
            'tags': [str(row['Tags'])] if 'Tags' in row and pd.notna(row['Tags']) else [],  # Array format
            'feasibility': float(row['Feasibility']) if 'Feasibility' in row and pd.notna(row['Feasibility']) else 5.0,
            'urgency': float(row['Urgency']) if 'Urgency' in row and pd.notna(row['Urgency']) else 5.0,
            'dimension': str(row['dimension']) if 'dimension' in row and pd.notna(row['dimension']) else steep_value.title(),
            # Radar columns
            'magnitude': float(row['magnitude']) if 'magnitude' in row and pd.notna(row['magnitude']) else None,
            'distance': float(row['distance']) if 'distance' in row and pd.notna(row['distance']) else None,
            'color_hex': str(row['color_hex']) if 'color_hex' in row and pd.notna(row['color_hex']) else None
        }
        records.append(record)
    
    # Batch insert
    with conn.cursor() as cur:
        insert_query = """
            INSERT INTO driving_forces (
                id, project_id, title, text, type, steep, scope,
                impact, ttm, sentiment, source, tags,
                feasibility, urgency, dimension,
                magnitude, distance, color_hex, created_at, updated_at
            ) VALUES %s
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
            cur, insert_query, values, template=None, page_size=1000
        )
    
    conn.commit()
    print(f"✅ Imported {len(records):,} driving forces")
    
    return len(records)

def show_import_summary(conn, project_id):
    """Show summary of imported data"""
    print("\n📊 IMPORT SUMMARY:")
    
    with conn.cursor() as cur:
        # Count by type
        cur.execute("""
            SELECT type, COUNT(*) as count
            FROM driving_forces 
            WHERE project_id = %s
            GROUP BY type
            ORDER BY count DESC
        """, (project_id,))
        
        type_counts = cur.fetchall()
        print("📈 Force Types:")
        for force_type, count in type_counts:
            type_names = {'M': 'Megatrends', 'T': 'Trends', 'WS': 'Weak Signals', 
                         'WC': 'Wildcards', 'S': 'Signals'}
            print(f"   - {type_names.get(force_type, force_type)}: {count:,}")
        
        # Count radar data
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(magnitude) as with_magnitude,
                COUNT(distance) as with_distance,
                COUNT(color_hex) as with_color
            FROM driving_forces 
            WHERE project_id = %s
        """, (project_id,))
        
        radar_stats = cur.fetchone()
        print(f"\n🎯 Radar Data:")
        print(f"   - Total records: {radar_stats[0]:,}")
        print(f"   - With magnitude: {radar_stats[1]:,}")
        print(f"   - With distance: {radar_stats[2]:,}")
        print(f"   - With color_hex: {radar_stats[3]:,}")

def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(description='Import unified ORION dataset')
    parser.add_argument('file', help='Path to unified dataset file (.csv or .xlsx)')
    parser.add_argument('--keep-existing', action='store_true', 
                       help='Keep existing data (don\'t clear database)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Validate file and show import plan without making changes')
    
    args = parser.parse_args()
    
    # Safety check for destructive operations
    if not args.keep_existing and not args.dry_run:
        print("⚠️  WARNING: This will DELETE existing data!")
        print("To proceed, set: export ORION_IMPORT_ALLOW=1")
        print("Or use --dry-run to test first, or --keep-existing to preserve data")
        if not os.environ.get('ORION_IMPORT_ALLOW'):
            print("❌ Exiting for safety. Set ORION_IMPORT_ALLOW=1 to proceed.")
            sys.exit(1)
    
    print("🚀 ORION Unified Dataset Importer")
    print("=" * 50)
    
    try:
        # Connect to database
        conn = connect_to_db()
        
        # Clear existing data (unless --keep-existing)
        if not args.keep_existing:
            project_id = clear_existing_data(conn, dry_run=args.dry_run)
        else:
            # Get or create default project
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM projects WHERE is_default = true LIMIT 1")
                result = cur.fetchone()
                if result:
                    project_id = result[0]
                else:
                    cur.execute("""
                        INSERT INTO projects (id, name, is_default, created_at, updated_at)
                        VALUES (gen_random_uuid(), 'Unified Dataset', true, NOW(), NOW())
                        RETURNING id
                    """)
                    project_id = cur.fetchone()[0]
                    conn.commit()
        
        # Load and validate dataset
        df = load_unified_dataset(args.file)
        df = validate_dataset(df)
        
        # Import data
        if args.dry_run:
            print(f"\n🔍 DRY RUN: Would import {len(df):,} records")
            imported_count = len(df)
        else:
            imported_count = import_driving_forces(conn, df, project_id)
        
        # Show summary
        if not args.dry_run:
            show_import_summary(conn, project_id)
        else:
            print(f"\n📊 DRY RUN SUMMARY:")
            print(f"📈 Force Types:")
            type_counts = df['Driving Force'].value_counts()
            for force_type, count in type_counts.items():
                print(f"   - {force_type}: {count:,}")
        
        print(f"\n🎉 SUCCESS!")
        print(f"📁 Imported {imported_count:,} records from: {args.file}")
        print(f"🆔 Project ID: {project_id}")
        print(f"\n💡 Your unified dataset is now loaded and ready to use!")
        
        conn.close()
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()