#!/bin/bash

set -e

echo "🚀 Starting ultra-fast ORION database import..."
echo

# Get default project ID
echo "📋 Getting default project..."
PROJECT_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM projects WHERE is_default = true LIMIT 1" | xargs)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ No default project found"
  exit 1
fi

echo "   ✅ Using project ID: $PROJECT_ID"
echo

# Clear existing forces
echo "🗑️  Clearing existing forces..."
psql "$DATABASE_URL" -c "DELETE FROM driving_forces WHERE project_id = '$PROJECT_ID'" > /dev/null
echo "   ✅ Cleared"
echo

# Run all import operations in a single psql session
echo "⚡ Importing forces (this may take a minute)..."
psql "$DATABASE_URL" << EOF
-- Create temp table
CREATE TEMP TABLE temp_forces_import (
  title text,
  type text,
  steep text,
  dimension text,
  scope text,
  impact text,
  ttm text,
  sentiment text,
  source text,
  tags text,
  text text,
  magnitude text,
  distance text,
  color_hex text
);

-- Import CSV
\COPY temp_forces_import FROM './orion_forces_import.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',')

-- Insert into main table
INSERT INTO driving_forces (
  project_id, title, type, steep, dimension, scope, impact, ttm,
  sentiment, source, tags, text, magnitude, distance, color_hex
)
SELECT 
  '$PROJECT_ID'::varchar,
  title,
  type,
  steep,
  dimension,
  scope,
  CASE WHEN impact = '' THEN NULL ELSE impact::real END,
  NULLIF(ttm, ''),
  sentiment,
  source,
  string_to_array(tags, ','),
  COALESCE(NULLIF(text, ''), title),
  CASE WHEN magnitude = '' THEN NULL ELSE magnitude::real END,
  CASE WHEN distance = '' THEN NULL ELSE distance::real END,
  NULLIF(color_hex, '')
FROM temp_forces_import;
EOF

echo "   ✅ Import complete"
echo

# Verify import
echo "🔍 Verifying import..."
echo
TOTAL=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM driving_forces WHERE project_id = '$PROJECT_ID'" | xargs)
echo "✅ Database updated successfully!"
echo "   Total forces: $TOTAL"
echo
echo "   Type distribution:"
psql "$DATABASE_URL" -c "
SELECT 
  CASE type
    WHEN 'M' THEN 'Megatrends'
    WHEN 'T' THEN 'Trends'
    WHEN 'WS' THEN 'Weak Signals'
    WHEN 'WC' THEN 'Wildcards'
    WHEN 'S' THEN 'Signals'
    ELSE type
  END as type_name,
  COUNT(*) as count
FROM driving_forces
WHERE project_id = '$PROJECT_ID'
GROUP BY type
ORDER BY count DESC
" | grep -v "^$"
