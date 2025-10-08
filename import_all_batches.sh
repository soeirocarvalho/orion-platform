#!/bin/bash

PROJECT_ID="6a20338e-cb24-4fab-a234-368833afeb45"
TOTAL_BATCHES=30
SUCCESS_COUNT=1  # First batch already imported

echo "🚀 ORION Database Batch Import"
echo "Project ID: $PROJECT_ID"
echo "Starting from batch 2 (batch 1 already imported)"
echo "======================================"

for i in $(seq 2 $TOTAL_BATCHES); do
    BATCH_NUM=$(printf "%02d" $i)
    echo "⏳ Importing batch $i/$TOTAL_BATCHES..."
    
    response=$(curl -s -X POST http://localhost:5000/api/v1/scanning/import \
        -F "file=@orion_batch_${BATCH_NUM}.csv" \
        -F "projectId=$PROJECT_ID" \
        --max-time 60)
    
    if [[ $response == *"\"count\":"* ]]; then
        count=$(echo "$response" | grep -o '"count":[0-9]*' | cut -d':' -f2)
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        TOTAL_IMPORTED=$((SUCCESS_COUNT * 1000))
        echo "✅ Batch $i: $count records imported successfully"
        echo "📊 Progress: $TOTAL_IMPORTED/29,749 records"
    else
        echo "❌ Batch $i failed: $response"
    fi
    
    # Brief pause between imports
    sleep 2
done

echo ""
echo "🎯 Import Complete!"
echo "📈 Final Status: $SUCCESS_COUNT/$TOTAL_BATCHES batches imported"
echo "🎉 Your ORION database is ready for analysis!"
