-- Migration: 20260420b_fix_custom_access_token_hook_null_cascade.sql
-- Fixes NULL-cascade bug in public.custom_access_token_hook that caused
-- 500 at POST /verify ("output claims ... Expected: object, given: null")
-- for freshly signed-up users whose profile columns contained NULLs.
-- to_jsonb() is STRICT: to_jsonb(NULL) returns SQL NULL, which poisons
-- every downstream jsonb_set(), ultimately making RETURN event emit NULL.
-- Fix: guard each jsonb_set call with an IS NOT NULL check.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'core'
AS $function$
DECLARE
  claims jsonb;
  profile_record record;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT organization_id, role, business_domain
  INTO profile_record
  FROM core.profiles
  WHERE id = (event->>'user_id')::uuid;

  IF FOUND THEN
    IF profile_record.organization_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{organization_id}', to_jsonb(profile_record.organization_id));
    END IF;
    IF profile_record.role IS NOT NULL THEN
      claims := jsonb_set(claims, '{user_role}', to_jsonb(profile_record.role));
    END IF;
    IF profile_record.business_domain IS NOT NULL THEN
      claims := jsonb_set(claims, '{business_domain}', to_jsonb(profile_record.business_domain));
    END IF;
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;

EXCEPTION WHEN OTHERS THEN
  RETURN event;
END;
$function$;
