/*
  # Create grievances table

  1. New Tables
    - `grievances`
      - `id` (bigint, primary key)
      - `user_id` (uuid) - References auth.users
      - `category` (text)
      - `subject` (text)
      - `description` (text)
      - `department` (text)
      - `priority` (text) - 'low', 'medium', 'high'
      - `status` (text) - 'pending', 'in-progress', 'resolved', 'rejected'
      - `remarks` (text) - Admin remarks
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `grievances`
    - Users can view their own grievances
    - Admins can view all grievances
    - Users can create grievances
    - Only admins can update status
*/

CREATE TABLE IF NOT EXISTS grievances (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  department text NOT NULL,
  priority text DEFAULT 'medium',
  status text DEFAULT 'pending',
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grievances"
  ON grievances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create grievances"
  ON grievances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all grievances"
  ON grievances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update grievances"
  ON grievances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
