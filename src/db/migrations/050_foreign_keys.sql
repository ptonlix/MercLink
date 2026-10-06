-- Cross-slice foreign keys. Fail with the orphan ids instead of deleting business rows.

DO $$
DECLARE
  orphan_ids text;
BEGIN
  SELECT string_agg(id, ', ' ORDER BY id) INTO orphan_ids
  FROM catalogs AS catalog
  WHERE NOT EXISTS (
    SELECT 1 FROM merchants AS merchant WHERE merchant.id = catalog.merchant_id
  );
  IF orphan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'orphan catalogs: %', orphan_ids;
  END IF;

  SELECT string_agg(id, ', ' ORDER BY id) INTO orphan_ids
  FROM orders AS purchase
  WHERE NOT EXISTS (
    SELECT 1 FROM buyers AS buyer WHERE buyer.id = purchase.buyer_id
  );
  IF orphan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'orphan orders: %', orphan_ids;
  END IF;

  SELECT string_agg(id, ', ' ORDER BY id) INTO orphan_ids
  FROM order_items AS item
  WHERE NOT EXISTS (SELECT 1 FROM catalogs AS catalog WHERE catalog.id = item.catalog_id)
     OR NOT EXISTS (SELECT 1 FROM products AS product WHERE product.id = item.product_id)
     OR NOT EXISTS (SELECT 1 FROM variants AS variant WHERE variant.id = item.variant_id);
  IF orphan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'orphan order_items: %', orphan_ids;
  END IF;
END $$;

ALTER TABLE catalogs
  ADD CONSTRAINT catalogs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants (id);

ALTER TABLE orders
  ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers (id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES catalogs (id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES variants (id);
