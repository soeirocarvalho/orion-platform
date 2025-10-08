-- Update cluster labels to use fixed 36 cluster names
-- Based on the force assignments in the features data

-- Create temporary mapping table for cluster name updates
CREATE TEMP TABLE cluster_name_mapping AS
SELECT 
    c.id as cluster_db_id,
    c.label as old_label,
    CASE 
        -- Extract numeric cluster ID from existing cluster labels patterns
        -- Map to fixed cluster names based on order and patterns
        WHEN c.label LIKE '%digital%' OR c.label LIKE '%data%' THEN 'AI & Automation'
        WHEN c.label LIKE '%health%' OR c.label LIKE '%medical%' THEN 'Healthcare Tech'
        WHEN c.label LIKE '%environment%' OR c.label LIKE '%green%' THEN 'Sustainability' 
        WHEN c.label LIKE '%finance%' OR c.label LIKE '%money%' THEN 'Financial Tech'
        WHEN c.label LIKE '%social%' OR c.label LIKE '%people%' THEN 'Social Dynamics'
        WHEN c.label LIKE '%city%' OR c.label LIKE '%urban%' THEN 'Smart Cities'
        WHEN c.label LIKE '%energy%' OR c.label LIKE '%power%' THEN 'Energy Systems'
        WHEN c.label LIKE '%transform%' OR c.label LIKE '%change%' THEN 'Digital Transformation'
        WHEN c.label LIKE '%education%' OR c.label LIKE '%learning%' THEN 'Education Innovation'
        WHEN c.label LIKE '%manufactur%' OR c.label LIKE '%industry%' THEN 'Manufacturing 4.0'
        WHEN c.label LIKE '%space%' OR c.label LIKE '%defense%' THEN 'Space & Defense'
        WHEN c.label LIKE '%food%' OR c.label LIKE '%agriculture%' THEN 'Food & Agriculture'
        WHEN c.label LIKE '%material%' OR c.label LIKE '%science%' THEN 'Materials Science'
        WHEN c.label LIKE '%quantum%' OR c.label LIKE '%computing%' THEN 'Quantum Computing'
        WHEN c.label LIKE '%bio%' OR c.label LIKE '%genetic%' THEN 'Biotechnology'
        WHEN c.label LIKE '%cyber%' OR c.label LIKE '%security%' THEN 'Cybersecurity'
        WHEN c.label LIKE '%transport%' OR c.label LIKE '%mobility%' THEN 'Transportation'
        WHEN c.label LIKE '%climate%' OR c.label LIKE '%environmental%' THEN 'Climate Action'
        WHEN c.label LIKE '%govern%' OR c.label LIKE '%policy%' THEN 'Governance'
        WHEN c.label LIKE '%work%' OR c.label LIKE '%employment%' THEN 'Future of Work'
        WHEN c.label LIKE '%consumer%' OR c.label LIKE '%retail%' THEN 'Consumer Tech'
        WHEN c.label LIKE '%media%' OR c.label LIKE '%content%' THEN 'Media Evolution'
        WHEN c.label LIKE '%supply%' OR c.label LIKE '%logistics%' THEN 'Supply Chain'
        WHEN c.label LIKE '%economy%' OR c.label LIKE '%economic%' THEN 'Data Economy'
        WHEN c.label LIKE '%wellness%' OR c.label LIKE '%care%' THEN 'Health & Wellness'
        WHEN c.label LIKE '%development%' OR c.label LIKE '%planning%' THEN 'Urban Development'
        WHEN c.label LIKE '%resource%' OR c.label LIKE '%management%' THEN 'Resource Management'
        WHEN c.label LIKE '%research%' OR c.label LIKE '%innovation%' THEN 'Scientific Research'
        WHEN c.label LIKE '%risk%' OR c.label LIKE '%resilience%' THEN 'Risk & Resilience'
        WHEN c.label LIKE '%human%' OR c.label LIKE '%enhancement%' THEN 'Human Enhancement'
        WHEN c.label LIKE '%society%' OR c.label LIKE '%community%' THEN 'Digital Society'
        WHEN c.label LIKE '%tech%' OR c.label LIKE '%technology%' THEN 'Environmental Tech'
        WHEN c.label LIKE '%infrastructure%' OR c.label LIKE '%systems%' THEN 'Infrastructure'
        WHEN c.label LIKE '%global%' OR c.label LIKE '%international%' THEN 'Global Systems'
        WHEN c.label LIKE '%market%' OR c.label LIKE '%emerging%' THEN 'Emerging Markets'
        WHEN c.label LIKE '%ecosystem%' OR c.label LIKE '%platform%' THEN 'Innovation Ecosystems'
        -- Default to numbered clusters for any unmatched patterns
        ELSE 'Cluster ' || ((ROW_NUMBER() OVER (ORDER BY c.created_at)) - 1)
    END as new_label
FROM clusters c
WHERE c.label IS NOT NULL;

-- Show the planned updates
SELECT old_label, new_label, COUNT(*) as cluster_count
FROM cluster_name_mapping 
GROUP BY old_label, new_label
ORDER BY old_label;

-- Apply the updates
UPDATE clusters 
SET label = cnm.new_label
FROM cluster_name_mapping cnm
WHERE clusters.id = cnm.cluster_db_id
AND clusters.label != cnm.new_label;

-- Show results
SELECT label, COUNT(*) as count
FROM clusters
GROUP BY label
ORDER BY label;