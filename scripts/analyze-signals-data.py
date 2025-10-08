#!/usr/bin/env python3
"""
Analyze the Signals sheet from the Excel file to understand its structure
"""

import pandas as pd
import sys
import os

def analyze_signals_sheet():
    """Analyze the structure of the Signals sheet"""
    
    excel_file = 'attached_assets/ORION_full_curated_megatrends_trends_20250927_195602_1759009168443.xlsx'
    
    if not os.path.exists(excel_file):
        print(f"❌ Excel file not found: {excel_file}")
        return
    
    try:
        # Read the Excel file and show sheet names
        xl = pd.ExcelFile(excel_file)
        print('📋 Available sheets:')
        for sheet in xl.sheet_names:
            print(f'  - {sheet}')
        
        # Look for Signals sheet (try different possible names)
        signals_sheet_name = None
        for sheet_name in ['Signals', 'Signal', 'signals', 'signal']:
            if sheet_name in xl.sheet_names:
                signals_sheet_name = sheet_name
                break
        
        if not signals_sheet_name:
            print('\n❌ No Signals sheet found')
            print('Available sheets:', xl.sheet_names)
            return
            
        print(f'\n🔍 Examining {signals_sheet_name} sheet...')
        
        # Read just a sample of the Signals sheet for structure analysis
        print('📋 Reading sample data for structure analysis...')
        signals_df = pd.read_excel(excel_file, sheet_name=signals_sheet_name, nrows=10)
        
        # Get full count separately
        full_df = pd.read_excel(excel_file, sheet_name=signals_sheet_name, usecols=[0])
        total_rows = len(full_df)
        
        print(f'📊 Signals data: {total_rows} total rows, analyzing first 10')
        print(f'📋 Columns ({len(signals_df.columns)}):')
        for i, col in enumerate(signals_df.columns):
            print(f'  {i+1:2d}. {col}')
        
        print(f'\n📈 Data types (sample):')
        for col in signals_df.columns:
            dtype = signals_df[col].dtype
            non_null = signals_df[col].notna().sum()
            sample_size = len(signals_df)
            print(f'  {col:<30} {dtype:<15} ({non_null}/{sample_size} non-null in sample)')
        
        print(f'\n📄 First 3 rows:')
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', None)
        pd.set_option('display.max_colwidth', 50)
        print(signals_df.head(3).to_string())
        
        print(f'\n📝 Sample data for key columns:')
        key_columns = ['Title', 'Description', 'Source', 'Tags'] if 'Title' in signals_df.columns else signals_df.columns[:4]
        for col in key_columns:
            if col in signals_df.columns:
                sample_values = signals_df[col].dropna().head(2).tolist()
                print(f'  {col}: {sample_values}')
        
        print(f'\n✅ Analysis complete!')
        
    except Exception as e:
        print(f'❌ Error analyzing Excel file: {e}')

if __name__ == "__main__":
    analyze_signals_sheet()