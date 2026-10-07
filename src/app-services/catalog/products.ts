import { createPublicId } from "../../shared/id";
import { validateFields } from "../../domain/catalog/attributes";
import {
  parseCover,
  parseMinorPrice,
  parseSku,
  parseStock,
  parseTitle,
} from "../../domain/catalog/catalogs";
import {
  parseAxisBody,
  parseProductBody,
  parseProductPatch,
  parseVariantBody,
  parseVariantPatch,
} from "../../domain/catalog/parse";
import { catalogFail, catalogOk, type CatalogResult } from "../../domain/catalog/result";
import {
  afterRestoreProduct,
  afterRestoreVariant,
  afterSoftDelete,
  assertPublishable,
  validateDeclareAxis,
  validateVariantOptions,
} from "../../domain/catalog/variants";
import {
  conflictFor,
  findProduct,
  findVariant,
  isUniqueViolation,
  loadFields,
  loadOptions,
  loadVariants,
  lockCatalog,
  lockProduct,
  lockVariants,
  ownedCatalog,
  readFields,
  toField,
  type Db,
  type Sql,
  type VariantRow,
} from "./db";
import { ownedMediaCover } from "./images";
import { mediaBaseUrl } from "./media-runtime";
import { productRecord, type ProductRecord, variantRecord } from "./records";

export async function createProduct(
  db: Sql,
  merchantId: string,
  catalogId: string,
  input: unknown,
): Promise<CatalogResult<ProductRecord>> {
  const parsed = parseProductBody(input);
  if (!parsed.ok) {
    return parsed;
  }
  const title = parseTitle(parsed.value.title);
  if (!title.ok) {
    return title;
  }
  const cover = parseCover(parsed.value.cover);
  if (!cover.ok) {
    return cover;
  }
  const sku = parseSku(parsed.value.sku);
  if (!sku.ok) {
    return sku;
  }
  const hasPrice = parsed.value.price !== undefined;
  const price = hasPrice ? parseMinorPrice(parsed.value.price) : undefined;
  if (price !== undefined && !price.ok) {
    return price;
  }
  const stock =
    hasPrice || parsed.value.stock !== undefined ? parseStock(parsed.value.stock) : undefined;
  if (stock !== undefined && !stock.ok) {
    return stock;
  }
  if (!hasPrice && (parsed.value.stock !== undefined || parsed.value.sku !== undefined)) {
    return catalogFail("validation_error", "创建默认规格时必须提供价格。");
  }
  try {
    return await db.begin(async (tx) => {
      const catalog = ownedCatalog(await lockCatalog(tx, catalogId), merchantId);
      if (catalog === undefined) {
        return catalogFail("not_found", "没有找到目录。");
      }
      const acceptedCover = await writableCover(tx, merchantId, catalogId, cover.value);
      if (!acceptedCover.ok) {
        return acceptedCover;
      }
      const fields = (await loadFields(tx, catalogId)).map(toField);
      const values = validateFields(fields, parsed.value.fields);
      if (!values.ok) {
        return values;
      }
      const productId = createPublicId("product");
      await tx`
        INSERT INTO products (
          id, catalog_id, title, status, cover, fields, schema_revision
        )
        VALUES (
          ${productId},
          ${catalogId},
          ${title.value},
          'off',
          ${acceptedCover.value},
          ${tx.json(values.value)},
          ${catalog.schema_revision}
        )
      `;
      if (price?.ok === true && stock?.ok === true) {
        await tx`
          INSERT INTO variants (
            id, catalog_id, product_id, sku, option_values, price, stock, status, cover
          )
          VALUES (
            ${createPublicId("variant")},
            ${catalogId},
            ${productId},
            ${sku.value},
            ${tx.json({})},
            ${price.value},
            ${stock.value},
            'on',
            ${acceptedCover.value}
          )
        `;
      }
      return catalogOk(await assemble(tx, productId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}

export async function patchProduct(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
  input: unknown,
): Promise<CatalogResult<ProductRecord>> {
  const parsed = parseProductPatch(input);
  if (!parsed.ok) {
    return parsed;
  }
  const title = parsed.value.title === undefined ? undefined : parseTitle(parsed.value.title);
  if (title !== undefined && !title.ok) {
    return title;
  }
  const cover = parsed.value.cover === undefined ? undefined : parseCover(parsed.value.cover);
  if (cover !== undefined && !cover.ok) {
    return cover;
  }
  try {
    return await db.begin(async (tx) => {
      const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId);
      if (!loaded.ok) {
        return loaded;
      }
      const acceptedCover =
        cover === undefined
          ? undefined
          : await writableCover(tx, merchantId, catalogId, cover.value);
      if (acceptedCover !== undefined && !acceptedCover.ok) {
        return acceptedCover;
      }
      const fields = (await loadFields(tx, catalogId)).map(toField);
      const values =
        parsed.value.fields === undefined
          ? catalogOk(readFields(loaded.value.fields))
          : validateFields(fields, parsed.value.fields);
      if (!values.ok) {
        return values;
      }
      if (loaded.value.status === "on" && loaded.value.deleted_at === null) {
        const publishable = assertPublishable({
          deleted: false,
          fields: values.value,
          definitions: fields,
          variants: (await loadVariants(tx, productId))
            .filter((row) => row.deleted_at === null)
            .map(variantState),
        });
        if (!publishable.ok) {
          return publishable;
        }
      }
      await tx`
        UPDATE products
        SET title = ${title?.ok === true ? title.value : loaded.value.title},
            cover = ${acceptedCover === undefined ? loaded.value.cover : acceptedCover.value},
            fields = ${tx.json(values.value)},
            updated_at = now()
        WHERE id = ${productId}
      `;
      return catalogOk(await assemble(tx, productId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}

export async function publishProduct(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
): Promise<CatalogResult<ProductRecord>> {
  return db.begin(async (tx) => {
    const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId);
    if (!loaded.ok) {
      return loaded;
    }
    const fields = (await loadFields(tx, catalogId)).map(toField);
    const variants = await lockVariants(tx, productId);
    const decision = assertPublishable({
      deleted: loaded.value.deleted_at !== null,
      fields: readFields(loaded.value.fields),
      definitions: fields,
      variants: variants.filter((row) => row.deleted_at === null).map(variantState),
    });
    if (!decision.ok) {
      return decision;
    }
    await tx`
      UPDATE products SET status = 'on', updated_at = now() WHERE id = ${productId}
    `;
    return catalogOk(await assemble(tx, productId));
  });
}

export async function unpublishProduct(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
): Promise<CatalogResult<ProductRecord>> {
  return db.begin(async (tx) => {
    const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.value.deleted_at !== null) {
      return catalogFail("not_found", "没有找到商品。");
    }
    await tx`
      UPDATE products SET status = 'off', updated_at = now() WHERE id = ${productId}
    `;
    return catalogOk(await assemble(tx, productId));
  });
}

export async function softDeleteProduct(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
): Promise<CatalogResult<ProductRecord>> {
  return db.begin(async (tx) => {
    const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.value.deleted_at !== null) {
      return catalogFail("not_found", "没有找到商品。");
    }
    const next = afterSoftDelete();
    await tx`
      UPDATE products
      SET status = ${next.status}, deleted_at = now(), updated_at = now()
      WHERE id = ${productId}
    `;
    return catalogOk(await assemble(tx, productId));
  });
}

export async function restoreProduct(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
): Promise<CatalogResult<ProductRecord>> {
  return db.begin(async (tx) => {
    const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId, true);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.value.deleted_at === null) {
      return catalogFail("conflict", "商品没有被删除。");
    }
    const next = afterRestoreProduct();
    await tx`
      UPDATE products
      SET status = ${next.status}, deleted_at = NULL, updated_at = now()
      WHERE id = ${productId}
    `;
    return catalogOk(await assemble(tx, productId));
  });
}

export async function declareAxis(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
  input: unknown,
): Promise<CatalogResult<ProductRecord>> {
  const parsed = parseAxisBody(input);
  if (!parsed.ok) {
    return parsed;
  }
  try {
    return await db.begin(async (tx) => {
      const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId);
      if (!loaded.ok) {
        return loaded;
      }
      const options = await loadOptions(tx, productId);
      const variants = (await loadVariants(tx, productId)).map(variantState);
      const axis = validateDeclareAxis({
        declaredAxes: options.map((option) => option.key),
        existing: variants,
        key: parsed.value.key,
        label: parsed.value.label,
      });
      if (!axis.ok) {
        return axis;
      }
      await tx`
        INSERT INTO product_axes (id, product_id, key, label, position)
        VALUES (
          ${createPublicId("axis")},
          ${productId},
          ${axis.value.key},
          ${axis.value.label},
          ${options.length}
        )
      `;
      await tx`UPDATE products SET updated_at = now() WHERE id = ${productId}`;
      return catalogOk(await assemble(tx, productId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}

export async function createVariant(
  db: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
  input: unknown,
): Promise<CatalogResult<ProductRecord>> {
  const parsed = parseVariantBody(input);
  if (!parsed.ok) {
    return parsed;
  }
  const price = parseMinorPrice(parsed.value.price);
  if (!price.ok) {
    return price;
  }
  const stock = parseStock(parsed.value.stock);
  if (!stock.ok) {
    return stock;
  }
  const sku = parseSku(parsed.value.sku);
  if (!sku.ok) {
    return sku;
  }
  const cover = parseCover(parsed.value.cover);
  if (!cover.ok) {
    return cover;
  }
  try {
    return await db.begin(async (tx) => {
      const loaded = await loadOwnedProduct(tx, merchantId, catalogId, productId);
      if (!loaded.ok) {
        return loaded;
      }
      const options = await loadOptions(tx, productId);
      const existing = (await lockVariants(tx, productId)).map(variantState);
      const combination = validateVariantOptions({
        declaredAxes: options.map((option) => option.key),
        existing,
        optionValues: parsed.value.optionValues,
      });
      if (!combination.ok) {
        return combination;
      }
      const acceptedCover = await writableCover(tx, merchantId, catalogId, cover.value);
      if (!acceptedCover.ok) {
        return acceptedCover;
      }
      await tx`
        INSERT INTO variants (
          id, catalog_id, product_id, sku, option_values, price, stock, status, cover
        )
        VALUES (
          ${createPublicId("variant")},
          ${catalogId},
          ${productId},
          ${sku.value},
          ${tx.json(combination.value)},
          ${price.value},
          ${stock.value},
          'on',
          ${acceptedCover.value}
        )
      `;
      await tx`UPDATE products SET updated_at = now() WHERE id = ${productId}`;
      return catalogOk(await assemble(tx, productId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}

export async function patchVariant(
  db: Sql,
  merchantId: string,
  catalogId: string,
  variantId: string,
  input: unknown,
): Promise<CatalogResult<ProductRecord>> {
  const parsed = parseVariantPatch(input);
  if (!parsed.ok) {
    return parsed;
  }
  const price = parsed.value.price === undefined ? undefined : parseMinorPrice(parsed.value.price);
  if (price !== undefined && !price.ok) {
    return price;
  }
  const stock = parsed.value.stock === undefined ? undefined : parseStock(parsed.value.stock);
  if (stock !== undefined && !stock.ok) {
    return stock;
  }
  const sku = parsed.value.sku === undefined ? undefined : parseSku(parsed.value.sku);
  if (sku !== undefined && !sku.ok) {
    return sku;
  }
  const cover = parsed.value.cover === undefined ? undefined : parseCover(parsed.value.cover);
  if (cover !== undefined && !cover.ok) {
    return cover;
  }
  try {
    return await db.begin(async (tx) => {
      const variant = await findVariant(tx, variantId);
      if (variant === undefined || variant.catalog_id !== catalogId) {
        return catalogFail("not_found", "没有找到规格。");
      }
      const loaded = await loadOwnedProduct(tx, merchantId, catalogId, variant.product_id, true);
      if (!loaded.ok) {
        return loaded;
      }
      const acceptedCover =
        cover === undefined
          ? undefined
          : await writableCover(tx, merchantId, catalogId, cover.value);
      if (acceptedCover !== undefined && !acceptedCover.ok) {
        return acceptedCover;
      }
      const restoring = parsed.value.restore === true;
      if (variant.deleted_at !== null && !restoring) {
        return catalogFail("not_found", "没有找到规格。");
      }
      const nextStatus = restoring
        ? afterRestoreVariant().status
        : parsed.value.status === "on" || parsed.value.status === "off"
          ? parsed.value.status
          : variant.status === "on"
            ? "on"
            : "off";
      if (nextStatus === "on" && loaded.value.status === "on" && loaded.value.deleted_at === null) {
        const projected = (await lockVariants(tx, variant.product_id)).map((row) => {
          const state = variantState(row);
          if (row.id !== variantId) {
            return state;
          }
          return { ...state, status: "on" as const, deleted: false };
        });
        const fields = (await loadFields(tx, catalogId)).map(toField);
        const publishable = assertPublishable({
          deleted: false,
          fields: readFields(loaded.value.fields),
          definitions: fields,
          variants: projected.filter((item) => !item.deleted),
        });
        if (!publishable.ok) {
          return publishable;
        }
      }
      await tx`
        UPDATE variants
        SET price = ${price?.ok === true ? price.value : variant.price},
            stock = ${stock === undefined ? variant.stock : stock.value},
            sku = ${sku === undefined ? variant.sku : sku.value},
            cover = ${acceptedCover === undefined ? variant.cover : acceptedCover.value},
            status = ${nextStatus},
            deleted_at = ${restoring ? null : variant.deleted_at},
            updated_at = now()
        WHERE id = ${variantId}
      `;
      return catalogOk(await assemble(tx, variant.product_id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}

export async function softDeleteVariant(
  db: Sql,
  merchantId: string,
  catalogId: string,
  variantId: string,
): Promise<CatalogResult<ProductRecord>> {
  return db.begin(async (tx) => {
    const variant = await findVariant(tx, variantId);
    if (variant === undefined || variant.catalog_id !== catalogId || variant.deleted_at !== null) {
      return catalogFail("not_found", "没有找到规格。");
    }
    const loaded = await loadOwnedProduct(tx, merchantId, catalogId, variant.product_id);
    if (!loaded.ok) {
      return loaded;
    }
    const next = afterSoftDelete();
    await tx`
      UPDATE variants
      SET status = ${next.status}, deleted_at = now(), updated_at = now()
      WHERE id = ${variantId}
    `;
    return catalogOk(await assemble(tx, variant.product_id));
  });
}

async function writableCover(
  db: Db,
  merchantId: string,
  catalogId: string,
  cover: string | null,
): Promise<CatalogResult<string | null>> {
  return ownedMediaCover(db, {
    merchantId,
    catalogId,
    cover,
    appBaseUrl: mediaBaseUrl(),
  });
}

async function loadOwnedProduct(
  db: Db,
  merchantId: string,
  catalogId: string,
  productId: string,
  allowDeleted = false,
) {
  const catalog = ownedCatalog(await lockCatalog(db, catalogId), merchantId);
  if (catalog === undefined) {
    return catalogFail("not_found", "没有找到目录。");
  }
  const product = await lockProduct(db, productId);
  if (
    product === undefined ||
    product.catalog_id !== catalogId ||
    (!allowDeleted && product.deleted_at !== null)
  ) {
    return catalogFail("not_found", "没有找到商品。");
  }
  return catalogOk(product);
}

async function assemble(db: Db, productId: string): Promise<ProductRecord> {
  const product = await findProduct(db, productId);
  if (product === undefined) {
    throw new Error("product disappeared inside its transaction");
  }
  const [options, variants] = await Promise.all([
    loadOptions(db, productId),
    loadVariants(db, productId),
  ]);
  return productRecord(product, options, variants);
}

function variantState(row: VariantRow) {
  return {
    optionValues: variantRecord(row).optionValues,
    status: variantRecord(row).status,
    deleted: row.deleted_at !== null,
    price: row.price,
  };
}
