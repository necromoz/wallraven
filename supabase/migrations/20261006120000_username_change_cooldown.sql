-- Usernames could be changed as often as anyone liked, straight from the app or
-- the website, because both write to profiles directly under RLS. A confirm
-- dialog alone would be cosmetic: anyone with a token could PATCH the row. So
-- the rule lives here.
--
-- Rule: claiming a username is free. Changing it after that is allowed once
-- every 30 days. The first change after claiming is free too (no timestamp yet),
-- which leaves room to fix a typo straight after signing up.
--
-- username_changed_at is set only by this trigger. Whatever a client sends for
-- it is overwritten, so it cannot be backdated to skip the wait.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_username_cooldown() RETURNS TRIGGER AS $$
DECLARE
  next_allowed timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.username_changed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.username IS NOT DISTINCT FROM OLD.username THEN
    NEW.username_changed_at := OLD.username_changed_at;
    RETURN NEW;
  END IF;

  IF OLD.username_changed_at IS NOT NULL THEN
    next_allowed := OLD.username_changed_at + interval '30 days';
    IF now() < next_allowed THEN
      -- The clients match on "username_cooldown" and read the date after it.
      RAISE EXCEPTION 'username_cooldown until %',
        to_char(next_allowed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.username_changed_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS profiles_username_cooldown ON public.profiles;
CREATE TRIGGER profiles_username_cooldown
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_username_cooldown();
