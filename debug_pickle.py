#!/usr/bin/env python3
import pickle
import sys

# Load and examine the pickle file
pickle_file = "attached_assets/precomputed_features_1758013839680.pkl"

try:
    with open(pickle_file, 'rb') as f:
        data = pickle.load(f)
    
    print("=== PICKLE FILE STRUCTURE ===")
    print(f"Type: {type(data)}")
    
    if isinstance(data, dict):
        print(f"Keys: {list(data.keys())}")
        for key, value in data.items():
            if hasattr(value, '__len__'):
                print(f"  {key}: {type(value)} with length {len(value)}")
                if isinstance(value, list) and len(value) > 0:
                    print(f"    First few items: {value[:3]}")
            else:
                print(f"  {key}: {type(value)} = {value}")
    
    print("\n=== CHECKING FOR ID-LIKE COLUMNS ===")
    if isinstance(data, dict):
        id_candidates = [k for k in data.keys() if 'id' in k.lower()]
        print(f"ID candidates: {id_candidates}")
        
        # Check for other common ID fields
        possible_ids = ['index', 'row_id', 'force_id', 'record_id']
        for field in possible_ids:
            if field in data:
                print(f"Found possible ID field: {field}")
    
    print("\n=== SAMPLE DATA (first 3 items) ===")
    if isinstance(data, dict):
        for key, value in list(data.items())[:10]:  # Show first 10 keys
            if hasattr(value, '__len__') and len(value) > 0:
                print(f"{key}: {value[:3] if len(value) >= 3 else value}")
    
except Exception as e:
    print(f"Error loading pickle file: {e}")
    sys.exit(1)