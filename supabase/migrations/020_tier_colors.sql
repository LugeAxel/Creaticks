-- 020_tier_colors.sql — Per-tier seat map color

ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6C63FF';

-- Backfill existing tiers: assign distinct colors based on insertion order
UPDATE ticket_tiers t
SET color = (ARRAY['#6C63FF','#FF6584','#43C6AC','#FFB347','#9B59B6','#3498DB','#E74C3C','#2ECC71'])[(t2.row_num % 8) + 1]
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at) - 1 AS row_num
  FROM ticket_tiers
  WHERE color = '#6C63FF'
) t2
WHERE t.id = t2.id;
