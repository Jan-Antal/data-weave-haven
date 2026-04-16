
-- Delete orphaned (2/2) duplicate inbox entries created by split bug
DELETE FROM production_inbox 
WHERE item_name LIKE '%(2/2)%' AND status = 'pending';

-- Delete orphaned (1/2) duplicate inbox entry for BK-N05
DELETE FROM production_inbox 
WHERE item_name LIKE '%(1/2)%' AND status = 'pending';
