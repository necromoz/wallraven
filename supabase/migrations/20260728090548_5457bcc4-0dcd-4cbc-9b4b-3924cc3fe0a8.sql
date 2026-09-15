CREATE TABLE public.device_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  verifier_hash text NOT NULL,
  device_name text,
  user_id uuid,
  session jsonb,
  claimed boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_pairings_expires_at_idx ON public.device_pairings (expires_at);

GRANT ALL ON public.device_pairings TO service_role;

ALTER TABLE public.device_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to device pairings"
  ON public.device_pairings
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);