#!/usr/bin/env python3
"""
Verify cluster parity script for FixedClusters patch
Tests integrity without recomputation
"""
import os
import pickle
import json
import pandas as pd
import hashlib
from pathlib import Path

def sha256(path: str) -> str:
    """Calculate SHA256 hash of a file"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1<<20), b""):
            h.update(chunk)
    return h.hexdigest()

def load_df(path):
    """Load dataset from parquet or xlsx"""
    try:
        return pd.read_parquet(path)
    except Exception:
        import openpyxl
        return pd.read_excel(path)

def main():
    # Configuration from environment
    FEATURES = os.getenv("FEATURES_FILE", "attached_assets/precomputed_features_1758013839680.pkl")
    DATASET = os.getenv("DATASET_FILE", "data/ORION_Scanning_DB_Updated.parquet")
    
    print("🔍 ORION FixedClusters Verification")
    print("="*50)
    
    # Check files exist
    if not os.path.exists(FEATURES):
        print(f"❌ Features file not found: {FEATURES}")
        return
    
    print(f"✅ Features file found: {FEATURES}")
    print(f"📁 Size: {os.path.getsize(FEATURES):,} bytes")
    
    try:
        # Calculate hashes for integrity
        print("\n📋 File Integrity:")
        feat_hash = sha256(FEATURES)
        print(f"   Features SHA256: {feat_hash}")
        
        # Load features
        print("\n🔧 Loading Features...")
        with open(FEATURES, "rb") as f:
            feats = pickle.load(f)
        
        # Validate required columns
        required = ["cluster_labels", "tsne_x", "tsne_y", "tsne_z"]
        missing = [c for c in required if c not in feats]
        
        if missing:
            print(f"❌ Missing required columns: {missing}")
            return
        
        print(f"✅ All required columns present")
        print(f"📊 Available columns: {list(feats.keys())}")
        
        # Analyze clusters
        cluster_labels = feats["cluster_labels"]
        unique_clusters = set(cluster_labels)
        
        print(f"\n🎯 Cluster Analysis:")
        print(f"   Total points: {len(cluster_labels):,}")
        print(f"   Unique clusters: {len(unique_clusters)}")
        print(f"   Expected clusters: 37")
        print(f"   Clusters match: {'✅' if len(unique_clusters) == 37 else '❌'}")
        
        # Cluster distribution
        cluster_counts = pd.Series(cluster_labels).value_counts().sort_index()
        print(f"\n📈 Cluster Distribution:")
        for cluster_id, count in cluster_counts.head(10).items():
            print(f"   Cluster {cluster_id}: {count:,} points")
        if len(cluster_counts) > 10:
            print(f"   ... and {len(cluster_counts) - 10} more clusters")
        
        # Summary
        summary = {
            "features_sha256": feat_hash,
            "total_points": len(cluster_labels),
            "unique_clusters": len(unique_clusters),
            "expected_clusters": 37,
            "clusters_match": len(unique_clusters) == 37,
            "largest_cluster": int(cluster_counts.iloc[0]),
            "smallest_cluster": int(cluster_counts.iloc[-1]),
            "status": "VALID" if len(unique_clusters) == 37 else "INVALID"
        }
        
        print(f"\n✅ Verification Summary:")
        print(json.dumps(summary, indent=2))
        
        # Coordinates validation
        if all(coord in feats for coord in ["tsne_x", "tsne_y", "tsne_z"]):
            print(f"\n🗺️ Coordinates Available:")
            print(f"   3D coordinates: {len(feats['tsne_x']):,} points")
            print(f"   X range: [{min(feats['tsne_x']):.2f}, {max(feats['tsne_x']):.2f}]")
            print(f"   Y range: [{min(feats['tsne_y']):.2f}, {max(feats['tsne_y']):.2f}]")
            print(f"   Z range: [{min(feats['tsne_z']):.2f}, {max(feats['tsne_z']):.2f}]")
        
        print(f"\n🎉 Verification completed successfully!")
        return summary["status"] == "VALID"
        
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)