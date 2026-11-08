-- PermissionsGuard, the inventory workspace, purchase-invoice capabilities and the pharmacy agent all match
-- permission names exactly, so the `prefix:*` entries that seed_rbac wrote into role defaults granted nothing
-- (a PHARMACIST without a personal list got 403 on POST /inventory/items). Replace each known wildcard in
-- "roles"."permissions" with the concrete names it was meant to cover, as listed in
-- src/shared/rbac/role-permissions.ts.
--
-- Guarded and idempotent: only rows whose JSON array holds one of the wildcards below are rewritten; other
-- entries keep their order, duplicates are dropped, '*' and unknown wildcards are left as they are, and rows
-- that are NULL, malformed or not an array are skipped. Rerunning finds nothing to rewrite.
-- pharmacy:drug:inventory-change:approve (DOCTOR) and billing:invoice:generateSamples (ADMIN-only tool) are
-- deliberately not part of any expansion. reports:* and visits:* matched no permission and are dropped.

DO $$
DECLARE
  expansion CONSTANT JSONB := '{
    "appointments:*": [
      "appointments:create",
      "appointments:read",
      "appointments:update",
      "appointments:reschedule",
      "appointments:delete",
      "appointments:bulkUpdate"
    ],
    "billing:*": [
      "billing:invoice:create",
      "billing:invoice:read",
      "billing:invoice:update",
      "billing:invoice:delete",
      "billing:payment:process",
      "billing:payment:bulk",
      "billing:payment:confirm",
      "billing:payment:read",
      "billing:payment:summary",
      "billing:refund:create",
      "billing:revenue:read",
      "billing:statistics:read"
    ],
    "inventory:*": [
      "inventory:item:create",
      "inventory:item:read",
      "inventory:item:update",
      "inventory:item:delete",
      "inventory:transaction:create",
      "inventory:transaction:read",
      "inventory:transaction:update",
      "inventory:transaction:delete",
      "inventory:transaction:bulk",
      "inventory:adjustment:create",
      "inventory:transfer:create",
      "inventory:po:create",
      "inventory:po:read",
      "inventory:po:update",
      "inventory:po:delete",
      "inventory:supplier:create",
      "inventory:supplier:read",
      "inventory:supplier:update",
      "inventory:supplier:delete",
      "inventory:report:stock",
      "inventory:statistics:read",
      "inventory:alerts:lowStock",
      "inventory:alerts:expiry",
      "inventory:movement:read",
      "inventory:search:barcode",
      "inventory:search:sku",
      "inventory:catalog:categories",
      "inventory:catalog:manufacturers",
      "inventory:storage:read",
      "inventory:dashboard:read"
    ],
    "pharmacy:*": [
      "pharmacy:drug:create",
      "pharmacy:drug:read",
      "pharmacy:drug:update",
      "pharmacy:drug:delete",
      "pharmacy:drug:autocomplete",
      "pharmacy:drug:categories",
      "pharmacy:drug:manufacturers",
      "pharmacy:drug:dosageForms",
      "pharmacy:drug:statistics",
      "pharmacy:drug:inventory-change:read",
      "pharmacy:drug:inventory-change:create",
      "pharmacy:invoice:create",
      "pharmacy:invoice:read",
      "pharmacy:invoice:update",
      "pharmacy:invoice:delete",
      "pharmacy:invoice:payment:add",
      "pharmacy:purchase-invoice:create",
      "pharmacy:purchase-invoice:read",
      "pharmacy:purchase-invoice:review",
      "pharmacy:purchase-invoice:commit-stock",
      "pharmacy:purchase-ledger:read",
      "pharmacy:purchase-ledger:write",
      "pharmacy:compliance:read",
      "pharmacy:compliance:audit",
      "pharmacy:dashboard:read",
      "pharmacy:dashboard:sales:read",
      "pharmacy:dashboard:topSelling:read",
      "pharmacy:dashboard:recentInvoices:read",
      "pharmacy:dashboard:alerts:read",
      "pharmacy:agent:use",
      "pharmacy:agent:proposal:apply"
    ],
    "reports:*": [],
    "visits:*": [],
    "inventory:item:*": [
      "inventory:item:create",
      "inventory:item:read",
      "inventory:item:update",
      "inventory:item:delete"
    ],
    "inventory:transaction:*": [
      "inventory:transaction:create",
      "inventory:transaction:read",
      "inventory:transaction:update",
      "inventory:transaction:delete",
      "inventory:transaction:bulk"
    ],
    "inventory:po:*": [
      "inventory:po:create",
      "inventory:po:read",
      "inventory:po:update",
      "inventory:po:delete"
    ],
    "inventory:supplier:*": [
      "inventory:supplier:create",
      "inventory:supplier:read",
      "inventory:supplier:update",
      "inventory:supplier:delete"
    ],
    "pharmacy:drug:*": [
      "pharmacy:drug:create",
      "pharmacy:drug:read",
      "pharmacy:drug:update",
      "pharmacy:drug:delete",
      "pharmacy:drug:autocomplete",
      "pharmacy:drug:categories",
      "pharmacy:drug:manufacturers",
      "pharmacy:drug:dosageForms",
      "pharmacy:drug:statistics"
    ],
    "pharmacy:invoice:*": [
      "pharmacy:invoice:create",
      "pharmacy:invoice:read",
      "pharmacy:invoice:update",
      "pharmacy:invoice:delete",
      "pharmacy:invoice:payment:add"
    ],
    "pharmacy:dashboard:*": [
      "pharmacy:dashboard:read",
      "pharmacy:dashboard:sales:read",
      "pharmacy:dashboard:topSelling:read",
      "pharmacy:dashboard:recentInvoices:read",
      "pharmacy:dashboard:alerts:read"
    ]
  }';
  role_row RECORD;
  stored JSONB;
  rewritten JSONB;
BEGIN
  FOR role_row IN SELECT "id", "permissions" FROM "roles" WHERE "permissions" LIKE '%:*%' LOOP
    BEGIN
      stored := role_row."permissions"::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    IF jsonb_typeof(stored) <> 'array' OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(stored) AS element("value")
      WHERE jsonb_typeof(element."value") = 'string' AND expansion ? (element."value" #>> '{}')
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(jsonb_agg(deduped."value" ORDER BY deduped."element_ord", deduped."expansion_ord"), '[]'::jsonb)
    INTO rewritten
    FROM (
      SELECT DISTINCT ON (expanded."value") expanded."value", expanded."element_ord", expanded."expansion_ord"
      FROM (
        SELECT element."value", element."ord" AS "element_ord", 0::bigint AS "expansion_ord"
        FROM jsonb_array_elements(stored) WITH ORDINALITY AS element("value", "ord")
        WHERE NOT (jsonb_typeof(element."value") = 'string' AND expansion ? (element."value" #>> '{}'))
        UNION ALL
        SELECT to_jsonb(concrete."permission"), element."ord", concrete."ord"
        FROM jsonb_array_elements(stored) WITH ORDINALITY AS element("value", "ord")
        CROSS JOIN LATERAL jsonb_array_elements_text(expansion -> (element."value" #>> '{}'))
          WITH ORDINALITY AS concrete("permission", "ord")
        WHERE jsonb_typeof(element."value") = 'string' AND expansion ? (element."value" #>> '{}')
      ) AS expanded
      ORDER BY expanded."value", expanded."element_ord", expanded."expansion_ord"
    ) AS deduped;

    UPDATE "roles"
    SET "permissions" = rewritten::text,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = role_row."id";
  END LOOP;
END $$;
