-- 001_create_documents_summaries.sql
-- Run this in your Supabase SQL editor or via psql using a service role key.

-- Enable pgcrypto if not enabled (for gen_random_uuid)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  path text,
  size bigint,
  uploaded_at timestamptz DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  summary text,
  model_info text,
  created_at timestamptz DEFAULT now()
);
