-- Custom product values are fields. Single-select values are choices.
-- Historical order snapshots stay in fields_snapshot and are not rewritten.

ALTER TABLE products RENAME COLUMN attrs TO fields;
ALTER TABLE products RENAME CONSTRAINT products_attrs_object TO products_fields_object;

ALTER TABLE product_fields RENAME COLUMN options TO choices;
ALTER TABLE product_fields RENAME CONSTRAINT product_fields_options_json TO product_fields_choices_json;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'variants'
      AND column_name = 'attrs'
  ) THEN
    ALTER TABLE variants RENAME COLUMN attrs TO fields;
  END IF;
END $$;
