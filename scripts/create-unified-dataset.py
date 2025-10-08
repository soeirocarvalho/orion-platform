#!/usr/bin/env python3
"""
Create Unified ORION Dataset
Merges parquet base data (29,749 records) with radar visualization columns from CSV.
Produces single master file for local editing.
"""

import pandas as pd
import numpy as np
import sys
import os
from pathlib import Path

def normalize_title(title):
    """Normalize title for matching between files"""
    if pd.isna(title):
        return ""
    return str(title).strip().lower()

def load_parquet_data():
    """Load base data from parquet file"""
    print("📊 Loading parquet base data...")
    
    parquet_file = 'data/ORION_Scanning_DB_Updated.parquet'
    if not os.path.exists(parquet_file):
        raise FileNotFoundError(f"Parquet file not found: {parquet_file}")
    
    df = pd.read_parquet(parquet_file)
    print(f"✅ Loaded {len(df):,} records from parquet")
    print(f"📋 Columns: {list(df.columns)}")
    
    # Add normalized title for matching
    df['title_normalized'] = df['Title'].apply(normalize_title)
    
    return df

def load_radar_csv():
    """Load radar visualization data from CSV"""
    print("\n🎯 Loading radar CSV data...")
    
    csv_file = 'attached_assets/RADAR_ORION_NEWVISUAL_distance_inverted_redistributed_1758670347554.csv'
    if not os.path.exists(csv_file):
        raise FileNotFoundError(f"CSV file not found: {csv_file}")
    
    df = pd.read_csv(csv_file, delimiter=';')
    print(f"✅ Loaded {len(df):,} records from CSV")
    print(f"📋 Columns: {list(df.columns)}")
    
    # Clean up the data
    df = df[df['driving_force'].notna() & (df['driving_force'].str.strip() != '')]
    
    # Add normalized title for matching
    df['title_normalized'] = df['driving_force'].apply(normalize_title)
    
    # Clean radar columns
    for col in ['magnitude', 'distance']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    print(f"✅ Cleaned to {len(df):,} valid records")
    
    # CRITICAL: Deduplicate radar data to ensure 1:1 mapping
    print("🔧 Deduplicating radar data to prevent row multiplication...")
    
    # Check for duplicates
    duplicates = df.groupby('title_normalized').size()
    duplicate_count = (duplicates > 1).sum()
    if duplicate_count > 0:
        print(f"⚠️  Found {duplicate_count} titles with multiple radar entries")
        
        # Add priority columns for sorting
        df['has_dimension'] = df['dimension'].notna().astype(int)
        df['has_magnitude'] = df['magnitude'].notna().astype(int)
        
        # Deduplicate using priority: prefer rows with dimension, then magnitude
        df_dedup = df.sort_values([
            'title_normalized',
            'has_dimension',
            'has_magnitude', 
            'magnitude'
        ], ascending=[True, False, False, False]).groupby('title_normalized').first().reset_index()
        
        # Clean up temporary columns
        df_dedup = df_dedup.drop(['has_dimension', 'has_magnitude'], axis=1)
        
        print(f"✅ Deduplicated to {len(df_dedup):,} unique records (removed {len(df) - len(df_dedup):,} duplicates)")
        return df_dedup
    
    return df

def merge_datasets(parquet_df, radar_df):
    """Merge parquet base data with radar visualization columns"""
    print("\n🔄 Merging datasets...")
    
    original_count = len(parquet_df)
    
    # Select radar columns to merge
    radar_columns = ['title_normalized', 'magnitude', 'distance', 'color_hex', 'dimension']
    radar_subset = radar_df[radar_columns].copy()
    
    # Merge on normalized titles
    merged_df = parquet_df.merge(
        radar_subset, 
        on='title_normalized', 
        how='left', 
        suffixes=('', '_radar')
    )
    
    # CRITICAL: Verify 1:1 cardinality preserved
    if len(merged_df) != original_count:
        raise ValueError(f"MERGE ERROR: Row count changed from {original_count:,} to {len(merged_df):,}. "
                        f"This indicates duplicate keys in radar data that multiply base rows. "
                        f"Check radar deduplication logic.")
    
    # Drop the normalized title column (no longer needed)
    merged_df = merged_df.drop('title_normalized', axis=1)
    
    print(f"✅ Merged dataset: {len(merged_df):,} records (verified 1:1 cardinality)")
    
    # Check match statistics
    matched_count = merged_df['magnitude'].notna().sum()
    unmatched_count = len(merged_df) - matched_count
    
    print(f"📈 Match Statistics:")
    print(f"   - Records with radar data: {matched_count:,}")
    print(f"   - Records without radar data: {unmatched_count:,}")
    print(f"   - Match rate: {(matched_count/len(merged_df)*100):.1f}%")
    
    # Verify no data corruption in base columns
    null_issues = []
    critical_cols = ['ID', 'Title', 'Description', 'Driving Force']
    for col in critical_cols:
        if col in merged_df.columns:
            null_count = merged_df[col].isna().sum()
            if null_count > 0:
                null_issues.append(f"{col}: {null_count} nulls")
    
    if null_issues:
        print(f"⚠️  Data integrity check - unexpected nulls: {', '.join(null_issues)}")
    else:
        print("✅ Data integrity verified - no corruption in base columns")
    
    return merged_df

def export_unified_dataset(df, format='csv'):
    """Export unified dataset to file"""
    print(f"\n💾 Exporting unified dataset as {format.upper()}...")
    
    if format.lower() == 'csv':
        output_file = 'unified_orion_dataset.csv'
        df.to_csv(output_file, index=False, encoding='utf-8')
    elif format.lower() == 'excel':
        output_file = 'unified_orion_dataset.xlsx'
        df.to_excel(output_file, index=False, engine='openpyxl')
    else:
        raise ValueError("Format must be 'csv' or 'excel'")
    
    print(f"✅ Exported to: {output_file}")
    print(f"📊 File size: {os.path.getsize(output_file) / 1024 / 1024:.1f} MB")
    
    return output_file

def show_column_summary(df):
    """Display summary of all columns in unified dataset"""
    print(f"\n📋 UNIFIED DATASET STRUCTURE:")
    print(f"Total records: {len(df):,}")
    print(f"Total columns: {len(df.columns)}")
    
    print(f"\n🏷️ All Columns:")
    for i, col in enumerate(df.columns, 1):
        null_count = df[col].isna().sum()
        data_type = str(df[col].dtype)
        print(f"{i:2d}. {col:<25} | {data_type:<10} | {null_count:,} nulls")
    
    print(f"\n📈 Force Type Distribution:")
    if 'Driving Force' in df.columns:
        type_counts = df['Driving Force'].value_counts()
        for force_type, count in type_counts.items():
            print(f"   - {force_type}: {count:,}")

def main():
    """Main execution function"""
    print("🚀 ORION Unified Dataset Creator")
    print("=" * 50)
    
    try:
        # Load both datasets
        parquet_df = load_parquet_data()
        radar_df = load_radar_csv()
        
        # Merge datasets
        unified_df = merge_datasets(parquet_df, radar_df)
        
        # Show structure
        show_column_summary(unified_df)
        
        # Export as CSV (default)
        csv_file = export_unified_dataset(unified_df, 'csv')
        
        # Also export as Excel for easier editing
        excel_file = export_unified_dataset(unified_df, 'excel')
        
        print(f"\n🎉 SUCCESS!")
        print(f"📁 Files created:")
        print(f"   - {csv_file}")
        print(f"   - {excel_file}")
        print(f"\n💡 You can now edit these files locally and use the import script to reload.")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()