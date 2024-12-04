-- Add history column to pcn_member_practices table
ALTER TABLE pcn_member_practices
  ADD COLUMN history jsonb DEFAULT '[]'::jsonb;

-- Create index for faster JSON queries
CREATE INDEX idx_pcn_members_history ON pcn_member_practices USING gin(history);