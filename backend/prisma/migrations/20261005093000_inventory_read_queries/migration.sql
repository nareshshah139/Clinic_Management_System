CREATE OR REPLACE FUNCTION inventory_read_json(value text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN data_exception THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION prescription_positive_number(value text) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE parsed double precision;
BEGIN
  parsed := substring(value from '^\s*([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)')::double precision;
  IF parsed > 0 AND parsed < 'Infinity'::double precision THEN RETURN parsed; END IF;
  RETURN NULL;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS inventory_items_branch_name_id_read_idx ON inventory_items ("branchId", name, id);

CREATE INDEX IF NOT EXISTS pharmacy_invoices_prescription_branch_read_idx ON pharmacy_invoices ("prescriptionId", "branchId");

CREATE OR REPLACE FUNCTION inventory_read_number(value text) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
  RETURN value::double precision;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;
