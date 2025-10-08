-- ORION Radar Data Import - Complete SQL Update Script
-- This script updates the driving_forces table with radar visualization data from CSV
-- Matches records by title and updates dimension, magnitude, distance, color_hex

-- Digital & Virtual Transformation
UPDATE driving_forces 
SET dimension = 'Digital & AI', magnitude = 10, distance = 1, color_hex = '#69f0ae', updated_at = CURRENT_TIMESTAMP
WHERE title = 'Digital & Virtual Transformation';

-- More sample updates (user can add more as needed)
UPDATE driving_forces 
SET dimension = 'Mobility', magnitude = 4, distance = 1, color_hex = '#d0021b', updated_at = CURRENT_TIMESTAMP
WHERE title = 'Biological chaos';

UPDATE driving_forces 
SET dimension = 'Digital & AI', magnitude = 4, distance = 1, color_hex = '#69f0ae', updated_at = CURRENT_TIMESTAMP
WHERE title = '5ºC+ Unavoidable';

UPDATE driving_forces 
SET dimension = 'Economy', magnitude = 4, distance = 1, color_hex = '#ffee58', updated_at = CURRENT_TIMESTAMP
WHERE title = 'Mass Migration of People';

-- Check total updated records
SELECT 
    COUNT(*) as total_with_radar_data,
    COUNT(CASE WHEN dimension IS NOT NULL THEN 1 END) as with_dimension,
    COUNT(CASE WHEN magnitude IS NOT NULL THEN 1 END) as with_magnitude,
    COUNT(CASE WHEN distance IS NOT NULL THEN 1 END) as with_distance,
    COUNT(CASE WHEN color_hex IS NOT NULL THEN 1 END) as with_color
FROM driving_forces;