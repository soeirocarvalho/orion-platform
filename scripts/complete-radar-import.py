#!/usr/bin/env python3
"""
ORION Complete Radar Data Import
Imports all 2,862 radar records from CSV into the ORION database using verified correspondence mapping.
"""

import csv
import os
import psycopg2
from psycopg2.extras import execute_values
import sys
from urllib.parse import urlparse

def normalize_title(title):
    """Normalize title for exact matching"""
    return title.strip()

def connect_to_db():
    """Connect to PostgreSQL database using DATABASE_URL"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    
    # Parse the database URL
    url_parts = urlparse(database_url)
    
    conn = psycopg2.connect(
        host=url_parts.hostname,
        port=url_parts.port,
        database=url_parts.path[1:],  # Remove leading '/'
        user=url_parts.username,
        password=url_parts.password
    )
    return conn

def load_csv_data():
    """Load and parse radar data from CSV file"""
    csv_file = 'attached_assets/RADAR_ORION_NEWVISUAL_distance_inverted_redistributed_1758670347554.csv'
    
    radar_data = []
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        
        for row in reader:
            driving_force = normalize_title(row.get('driving_force', '').strip())
            if not driving_force:
                continue
                
            # Parse radar values
            try:
                magnitude = float(row.get('magnitude', 0)) if row.get('magnitude', '').strip() else None
                distance = float(row.get('distance', 0)) if row.get('distance', '').strip() else None
            except ValueError:
                magnitude = None
                distance = None
            
            dimension = row.get('dimension', '').strip() or None
            color_hex = row.get('color_hex', '').strip() or None
            
            radar_data.append({
                'title': driving_force,
                'dimension': dimension,
                'magnitude': magnitude,
                'distance': distance,
                'color_hex': color_hex
            })
    
    return radar_data

def update_radar_data(conn, radar_data):
    """Update database with radar visualization data"""
    cur = conn.cursor()
    
    # Prepare batch update query
    update_query = """
    UPDATE driving_forces 
    SET 
        dimension = %s,
        magnitude = %s,
        distance = %s, 
        color_hex = %s,
        updated_at = CURRENT_TIMESTAMP
    WHERE title = %s
    """
    
    # Prepare data for batch update
    update_data = []
    for record in radar_data:
        update_data.append((
            record['dimension'],
            record['magnitude'], 
            record['distance'],
            record['color_hex'],
            record['title']
        ))
    
    print(f"Updating {len(update_data)} records with radar data...")
    
    # Execute batch update
    cur.executemany(update_query, update_data)
    updated_rows = cur.rowcount
    
    conn.commit()
    cur.close()
    
    return updated_rows

def verify_import():
    """Verify the import results"""
    conn = connect_to_db()
    cur = conn.cursor()
    
    # Check total records with radar data
    cur.execute("""
        SELECT 
            COUNT(*) as total_records,
            COUNT(CASE WHEN dimension IS NOT NULL THEN 1 END) as with_dimension,
            COUNT(CASE WHEN magnitude IS NOT NULL THEN 1 END) as with_magnitude,
            COUNT(CASE WHEN distance IS NOT NULL THEN 1 END) as with_distance,
            COUNT(CASE WHEN color_hex IS NOT NULL THEN 1 END) as with_color
        FROM driving_forces
    """)
    
    result = cur.fetchone()
    print(f"\nImport Verification:")
    print(f"Total records: {result[0]}")
    print(f"Records with dimension: {result[1]}")
    print(f"Records with magnitude: {result[2]}")
    print(f"Records with distance: {result[3]}")
    print(f"Records with color_hex: {result[4]}")
    
    # Check by dimension
    cur.execute("""
        SELECT dimension, COUNT(*) as count
        FROM driving_forces 
        WHERE dimension IS NOT NULL
        GROUP BY dimension
        ORDER BY count DESC
        LIMIT 10
    """)
    
    print(f"\nTop 10 Dimensions:")
    for dim, count in cur.fetchall():
        print(f"  {dim}: {count}")
    
    cur.close()
    conn.close()

def main():
    """Main import process"""
    try:
        print("🎯 ORION Complete Radar Data Import")
        print("=" * 50)
        
        # Load CSV data
        print("📊 Loading CSV radar data...")
        radar_data = load_csv_data()
        print(f"✅ Loaded {len(radar_data)} radar records from CSV")
        
        # Connect to database
        print("🔌 Connecting to ORION database...")
        conn = connect_to_db()
        print("✅ Connected successfully")
        
        # Update radar data
        print("🚀 Updating database with radar visualization data...")
        updated_rows = update_radar_data(conn, radar_data)
        print(f"✅ Successfully updated {updated_rows} database records")
        
        conn.close()
        
        # Verify results
        print("🔍 Verifying import results...")
        verify_import()
        
        print("\n🎉 Radar data import completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during import: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()