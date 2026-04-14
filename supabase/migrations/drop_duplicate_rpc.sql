DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'confirm_sale_transaction'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'mandi')
  LOOP
    EXECUTE 'DROP FUNCTION ' || rec.func_signature || ' CASCADE';
  END LOOP;
END;
$$;
