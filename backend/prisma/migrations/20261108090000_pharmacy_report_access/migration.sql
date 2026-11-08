-- PHARMACIST and ACCOUNTANT are listed on the pharmacy report routes, but the routes also require
-- pharmacy:compliance:read, which no role record granted. Rows whose permissions are not a JSON array are left alone.
DO $$
DECLARE
  r RECORD;
  current_permissions JSONB;
BEGIN
  FOR r IN SELECT id, permissions FROM roles WHERE name IN ('PHARMACIST', 'ACCOUNTANT') LOOP
    BEGIN
      current_permissions := COALESCE(NULLIF(r.permissions, ''), '[]')::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(current_permissions) = 'array' AND NOT current_permissions ? 'pharmacy:compliance:read' THEN
      UPDATE roles
      SET permissions = (current_permissions || '["pharmacy:compliance:read"]'::jsonb)::text,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
