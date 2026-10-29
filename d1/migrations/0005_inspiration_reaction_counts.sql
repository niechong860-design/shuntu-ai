-- Keep denormalized counters consistent with the unique reaction rows.
-- This migration is local source only until separately reviewed and applied.
CREATE TRIGGER IF NOT EXISTS case_likes_count_after_insert
AFTER INSERT ON case_likes
BEGIN
  UPDATE inspiration_cases
  SET likes_count = likes_count + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.case_id;
END;

CREATE TRIGGER IF NOT EXISTS case_likes_count_after_delete
AFTER DELETE ON case_likes
BEGIN
  UPDATE inspiration_cases
  SET likes_count = MAX(0, likes_count - 1), updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.case_id;
END;

CREATE TRIGGER IF NOT EXISTS case_favorites_count_after_insert
AFTER INSERT ON case_favorites
BEGIN
  UPDATE inspiration_cases
  SET favorites_count = favorites_count + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.case_id;
END;

CREATE TRIGGER IF NOT EXISTS case_favorites_count_after_delete
AFTER DELETE ON case_favorites
BEGIN
  UPDATE inspiration_cases
  SET favorites_count = MAX(0, favorites_count - 1), updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.case_id;
END;
