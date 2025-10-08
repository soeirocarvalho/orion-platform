#!/usr/bin/env python3
"""
Import Radar Visualization Data - ORION Project
Matches CSV radar data to existing ORION database records and updates radar columns.

Usage: python scripts/import-radar-data.py
"""

import csv
import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, List, Optional, Tuple

# Database connection from environment
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    sys.exit(1)

# CSV file path
CSV_PATH = 'attached_assets/RADAR_ORION_NEWVISUAL_distance_inverted_redistributed_1758670347554.csv'

# Type mapping from CSV full names to ORION database codes
TYPE_MAPPING = {
    'Megatrend': 'M',
    'Trend': 'T', 
    'Weak Signal': 'WS',
    'Wildcard': 'WC',
    'Signal': 'S'
}

def read_csv_radar_data() -> List[Dict]:
    """Read and parse CSV radar data."""
    print("Reading CSV radar data...")
    radar_data = []
    
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            # Only include rows with actual content
            if row.get('driving_force', '').strip():
                radar_data.append({
                    'csv_id': row.get('ID', ''),
                    'dimension': row.get('dimension', ''),
                    'type': row.get('type', ''),
                    'driving_force': row.get('driving_force', '').strip(),
                    'magnitude': float(row.get('magnitude', '0')) if row.get('magnitude', '').strip() else None,
                    'distance': float(row.get('distance', '0')) if row.get('distance', '').strip() else None,
                    'color_hex': row.get('color_hex', '').strip() if row.get('color_hex', '').strip() else None
                })
    
    print(f"Read {len(radar_data)} radar records from CSV")
    return radar_data

def get_orion_database_records() -> List[Dict]:
    """Fetch current ORION database records."""
    print("Fetching ORION database records...")
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all driving forces from default project
        cur.execute("""
            SELECT id, title, type, steep, dimension, magnitude, distance, color_hex
            FROM driving_forces 
            WHERE project_id = (SELECT id FROM projects WHERE is_default = true LIMIT 1)
            ORDER BY title
        """)
        
        records = [dict(row) for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        print(f"Fetched {len(records)} records from ORION database")
        return records
        
    except Exception as e:
        print(f"Error fetching database records: {e}")
        return []

def find_matches(csv_data: List[Dict], db_records: List[Dict]) -> List[Tuple[Dict, Dict]]:
    """Find matching records between CSV and database."""
    print("Finding matches between CSV and database records...")
    
    matches = []
    unmatched_csv = []
    unmatched_db = []
    
    # Create lookup dictionary for database records by title
    db_by_title = {rec['title'].lower().strip(): rec for rec in db_records}
    
    for csv_row in csv_data:
        csv_title = csv_row['driving_force'].lower().strip()
        csv_type_code = TYPE_MAPPING.get(csv_row['type'])
        
        if csv_title in db_by_title:
            db_record = db_by_title[csv_title]
            
            # Verify type matching (optional, for quality control)
            if csv_type_code and db_record['type'] != csv_type_code:
                print(f"WARNING: Type mismatch for '{csv_row['driving_force'][:50]}...': CSV={csv_row['type']} -> {csv_type_code}, DB={db_record['type']}")
            
            matches.append((csv_row, db_record))
        else:
            unmatched_csv.append(csv_row)
    
    # Find unmatched DB records
    matched_db_titles = set(match[1]['title'].lower().strip() for match in matches)
    unmatched_db = [rec for rec in db_records if rec['title'].lower().strip() not in matched_db_titles]
    
    print(f"Match Results:")
    print(f"  - Matched records: {len(matches)}")
    print(f"  - Unmatched CSV records: {len(unmatched_csv)}")
    print(f"  - Unmatched DB records: {len(unmatched_db)}")
    
    return matches, unmatched_csv, unmatched_db

def update_radar_data(matches: List[Tuple[Dict, Dict]]) -> int:
    """Update database records with radar visualization data."""
    print("Updating database with radar visualization data...")
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        updates = 0
        for csv_row, db_record in matches:
            # Skip if no radar data to update
            if not any([csv_row.get('dimension'), csv_row.get('magnitude'), 
                       csv_row.get('distance'), csv_row.get('color_hex')]):
                continue
                
            # Update radar fields
            cur.execute("""
                UPDATE driving_forces 
                SET dimension = %s, magnitude = %s, distance = %s, color_hex = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (
                csv_row.get('dimension'),
                csv_row.get('magnitude'),
                csv_row.get('distance'), 
                csv_row.get('color_hex'),
                db_record['id']
            ))
            updates += 1
            
            if updates % 100 == 0:
                print(f"  Updated {updates} records...")
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"Successfully updated {updates} records with radar data")
        return updates
        
    except Exception as e:
        print(f"Error updating database: {e}")
        return 0

def main():
    """Main import process."""
    print("ORION Radar Data Import")
    print("======================")
    
    # Step 1: Read CSV data
    csv_data = read_csv_radar_data()
    if not csv_data:
        print("No CSV data found. Exiting.")
        return
    
    # Step 2: Fetch database records
    db_records = get_orion_database_records()
    if not db_records:
        print("No database records found. Exiting.")
        return
    
    # Step 3: Find matches
    matches, unmatched_csv, unmatched_db = find_matches(csv_data, db_records)
    if not matches:
        print("No matches found between CSV and database. Exiting.")
        return
    
    # Step 4: Show sample matches for verification
    print("\nSample Matches (first 5):")
    for i, (csv_row, db_record) in enumerate(matches[:5]):
        print(f"  {i+1}. CSV: {csv_row['driving_force'][:40]}...")
        print(f"     DB:  {db_record['title'][:40]}...")
        print(f"     Radar: dimension={csv_row.get('dimension')}, magnitude={csv_row.get('magnitude')}, distance={csv_row.get('distance')}, color={csv_row.get('color_hex')}")
        print()
    
    # Step 5: Auto-confirm for batch processing  
    print(f"Proceeding with update of {len(matches)} database records with radar data...")
    # Skipping interactive confirmation for automated execution
    
    # Step 6: Update database
    updated = update_radar_data(matches)
    
    print(f"\nImport completed successfully!")
    print(f"  - Total matches: {len(matches)}")
    print(f"  - Records updated: {updated}")
    print(f"  - CSV records not matched: {len(unmatched_csv)}")
    print(f"  - DB records not matched: {len(unmatched_db)}")

if __name__ == "__main__":
    main()