import { insecureFetch } from "./httpClient.js";

const compactText = (value) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

const trimTrailingSlash = (value) => compactText(value).replace(/\/+$/, "");

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatSmartupDate = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
};

const buildBasicAuth = (login, password) =>
  `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`;

const buildSmartupUrl = (config, path) =>
  `${trimTrailingSlash(config.serverName)}/${path.replace(/^\/+/, "")}`;

const buildSmartupHeaders = (config) => {
  const headers = {
    Authorization: buildBasicAuth(config.login, config.password),
    project_code: config.projectCode,
    "Content-Type": "application/json",
  };

  if (compactText(config.filialId)) {
    headers.filial_id = compactText(config.filialId);
  }

  return headers;
};

const readResponseBody = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const readSmartupErrorMessage = (payload, fallbackMessage) => {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((item) => compactText(item?.message) || compactText(item?.code))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload?.raw === "string" && payload.raw.trim()) {
    return payload.raw.trim().slice(0, 300);
  }

  return fallbackMessage;
};

const requestSmartup = async (config, path, payload, fallbackMessage) => {
  const response = await insecureFetch(buildSmartupUrl(config, path), {
    method: "POST",
    headers: buildSmartupHeaders(config),
    body: JSON.stringify(payload),
  });
  const data = await readResponseBody(response);

  if (!response.ok) {
    const error = new Error(readSmartupErrorMessage(data, fallbackMessage));

    error.statusCode = response.status;
    error.responsePayload = data;
    throw error;
  }

  return data || {};
};

const unwrapArray = (payload, key) => (Array.isArray(payload?.[key]) ? payload[key] : []);

const resolveInventoryCode = (value) =>
  compactText(
    value?.product_code ||
      value?.inventory_code ||
      value?.code ||
      value?.product_id ||
      value?.id,
  );

const resolveBarcode = (value) => {
  const raw = value?.barcodes || value?.barcode || value?.inventory_barcode;

  if (Array.isArray(raw)) {
    return compactText(raw[0]?.barcode || raw[0]?.code || raw[0]);
  }

  return compactText(raw).split(/[;,]/)[0]?.trim() || "";
};

const isActive = (value) => {
  const state = compactText(value?.state).toUpperCase();

  return !state || state === "A";
};

const buildGroupMaps = (groups) => {
  const categoryByCode = new Map();
  const subCategoryByCode = new Map();

  for (const group of groups.filter(isActive)) {
    const categoryId = compactText(group?.code);
    const categoryName = compactText(group?.name);

    if (!categoryId || !categoryName) {
      continue;
    }

    categoryByCode.set(categoryId, {
      CS_id: categoryId,
      SD_id: categoryId,
      code_1C: categoryId,
      name: categoryName,
      active: "Y",
    });

    for (const type of Array.isArray(group?.product_group_types)
      ? group.product_group_types
      : []) {
      if (!isActive(type)) {
        continue;
      }

      const subCategoryId = compactText(type?.code);
      const subCategoryName = compactText(type?.name);

      if (!subCategoryId || !subCategoryName) {
        continue;
      }

      subCategoryByCode.set(subCategoryId, {
        CS_id: subCategoryId,
        SD_id: subCategoryId,
        code_1C: subCategoryId,
        name: subCategoryName,
        productCategory: {
          CS_id: categoryId,
          SD_id: categoryId,
          code_1C: categoryId,
          name: categoryName,
        },
      });
    }
  }

  return { categoryByCode, subCategoryByCode };
};

const buildPriceMap = (prices) =>
  prices.reduce((map, item) => {
    const productCode = resolveInventoryCode(item);
    const priceTypes = Array.isArray(item?.price_type) ? item.price_type : [];
    const selectedPrice =
      priceTypes.find((priceType) => toFiniteNumber(priceType?.price) > 0) ||
      priceTypes[0];
    const price = toFiniteNumber(selectedPrice?.price);
    // const priceTypeCode = compactText(selectedPrice?.price_type_code);

    if (productCode) {
      // map.set(productCode, { price, priceTypeCode });
      map.set(productCode, { price });
    }

    return map;
  }, new Map());

const buildStockMap = (balances) =>
  balances.reduce((map, item) => {
    const productCode = resolveInventoryCode(item);
    const quantity = toFiniteNumber(item?.quantity);

    if (!productCode || quantity <= 0) {
      return map;
    }

    const current = map.get(productCode) || {
      quantity: 0,
      warehouseCode: compactText(item?.warehouse_code),
    };

    map.set(productCode, {
      quantity: current.quantity + quantity,
      warehouseCode: current.warehouseCode || compactText(item?.warehouse_code),
    });

    return map;
  }, new Map());

const resolveProductGroupRefs = (product, categoryByCode, subCategoryByCode) => {
  const groups = Array.isArray(product?.groups) ? product.groups : [];
  const categoryCode =
    groups.map((group) => compactText(group?.group_code)).find((code) => categoryByCode.has(code)) ||
    "";
  const subCategoryCode =
    groups.map((group) => compactText(group?.type_code)).find((code) => subCategoryByCode.has(code)) ||
    "";

  return {
    category: categoryByCode.get(categoryCode) || null,
    subCategory: subCategoryByCode.get(subCategoryCode) || null,
  };
};

const normalizeSmartupProduct = (
  product,
  { categoryByCode, subCategoryByCode, priceByCode, stockByCode },
  // { categoryByCode, subCategoryByCode, priceByCode, stockByCode, defaultPriceTypeCode },
) => {
  const productCode = resolveInventoryCode(product);
  const priceInfo = priceByCode.get(productCode) || {};
  const stockInfo = stockByCode.get(productCode) || {};
  const { category, subCategory } = resolveProductGroupRefs(
    product,
    categoryByCode,
    subCategoryByCode,
  );

  if (!productCode || !isActive(product)) {
    return null;
  }

  return {
    CS_id: productCode,
    SD_id: productCode,
    code_1C: productCode,
    id: productCode,
    name:
      compactText(product?.name) ||
      compactText(product?.short_name) ||
      "Nomsiz mahsulot",
    code: productCode,
    barCode: resolveBarcode(product),
    imageUrl: compactText(product?.image_url || product?.photo_url || product?.imageUrl),
    thumbUrl: compactText(product?.thumb_url || product?.image_thumb_url || product?.thumbUrl),
    price: toFiniteNumber(priceInfo.price),
    priceValue: toFiniteNumber(priceInfo.price),
    stockLevel: toFiniteNumber(stockInfo.quantity),
    packQuantity: toFiniteNumber(product?.box_quant),
    // price_type: priceInfo.priceTypeCode || defaultPriceTypeCode,
    warehouseCode: stockInfo.warehouseCode,
    productCategory: category,
    productSubCategory: subCategory,
    raw: product,
  };
};

export const fetchSmartupCatalog = async (config) => {
  const today = formatSmartupDate();
  const [groupsPayload, productsPayload, pricesPayload, balancePayload] =
    await Promise.all([
      requestSmartup(
        config,
        "/b/anor/mxsx/mr/product_group$export",
        {},
        "Failed to fetch Smartup product groups.",
      ),
      requestSmartup(
        config,
        "/b/anor/mxsx/mr/inventory$export",
        {},
        "Failed to fetch Smartup inventory.",
      ),
      requestSmartup(
        config,
        "/b/anor/api/v2/mkf/product_price$export",
        {
          // price_type_codes: config.priceTypeCode ? [config.priceTypeCode] : [],
          price_type_codes: [],
        },
        "Failed to fetch Smartup prices.",
      ),
      requestSmartup(
        config,
        "/b/anor/mxsx/mkw/balance$export",
        {
          warehouse_codes: config.warehouseCode
            ? [{ warehouse_code: config.warehouseCode }]
            : [],
          filial_code: config.filialCode || "",
          product_conditions: ["F"],
          begin_date: today,
          end_date: today,
        },
        "Failed to fetch Smartup balances.",
      ),
    ]);
  const groups = unwrapArray(groupsPayload, "product_group");
  const products = unwrapArray(productsPayload, "inventory");
  const prices = unwrapArray(pricesPayload, "inventory");
  const balances = unwrapArray(balancePayload, "balance");

  console.info("[Smartup] product_group$export groups");
  console.dir(groups, { depth: null, colors: true });

  const { categoryByCode, subCategoryByCode } = buildGroupMaps(groups);
  const priceByCode = buildPriceMap(prices);
  const stockByCode = buildStockMap(balances);
  const normalizedProducts = products
    .map((product) =>
      normalizeSmartupProduct(product, {
        categoryByCode,
        subCategoryByCode,
        priceByCode,
        stockByCode,
        // defaultPriceTypeCode: config.priceTypeCode,
        defaultPriceTypeCode: "",
      }),
    )
    .filter((product) => product && product.stockLevel > 0);

  return {
    status: true,
    result: {
      productCategory: [...categoryByCode.values()],
      productSubCategory: [...subCategoryByCode.values()],
      product: normalizedProducts,
    },
  };
};

const resolveOrderProductCode = (item) =>
  compactText(
    item?.productCode ||
      item?.code ||
      item?.id ||
      item?.raw?.code ||
      item?.raw?.code_1C ||
      item?.raw?.CS_id ||
      item?.raw?.SD_id,
  );

const buildExternalId = (dealerId) =>
  `tujjors-${compactText(dealerId) || "order"}-${Date.now()}`;

export const buildSmartupOrderPayload = (config, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const externalId = compactText(payload?.externalId) || buildExternalId(payload?.dealerId);
  const orderProducts = items
    .map((item, index) => {
      const productCode = resolveOrderProductCode(item);
      const quantity = toFiniteNumber(item?.quantity);

      if (!productCode || quantity <= 0) {
        return null;
      }

      return {
        external_id: `${externalId}-${index + 1}`,
        product_unit_id: "",
        inventory_kind: compactText(item?.inventoryKind) || "G",
        warehouse_code:
          compactText(item?.warehouseCode) ||
          compactText(item?.raw?.warehouseCode) ||
          config.warehouseCode ||
          "",
        product_code: productCode,
        serial_number: "",
        card_code: "",
        expiry_date: "",
        on_balance: "",
        order_quant: String(quantity),
        // price_type_code:
        //   compactText(item?.priceTypeCode) ||
        //   compactText(item?.priceType) ||
        //   config.priceTypeCode ||
        //   "",
        price_type_code: "",
        product_price: String(toFiniteNumber(item?.price)),
        margin_kind: "",
        margin_value: "",
        margin_amount: "",
        vat_percent: "",
      };
    })
    .filter(Boolean);

  if (orderProducts.length === 0) {
    const error = new Error("Smartup order must contain at least one valid product.");

    error.statusCode = 400;
    throw error;
  }

  return {
    order: [
      {
        filial_code: config.filialCode || "",
        external_id: externalId,
        deal_id: "",
        subfilial_code: "",
        delivery_number: externalId,
        delivery_date: formatSmartupDate(),
        room_code: config.roomCode || "",
        robot_code: config.robotCode || "",
        deal_time: formatSmartupDate(),
        status: "A",
        sales_manager_code: config.salesManagerCode || "",
        person_code: config.personCode || "",
        currency_code: config.currencyCode || "860",
        owner_person_code: "",
        van_code: "",
        contract_code: "",
        note: [
          compactText(payload?.name),
          compactText(payload?.phone),
          compactText(payload?.link),
        ]
          .filter(Boolean)
          .join(" | "),
        self_shipment: "",
        delivery_address_short: "",
        delivery_address_full: "",
        marking_attaching_method: "",
        invoice_number: externalId,
        expeditor_code: "",
        payment_type_code: "",
        order_products: orderProducts,
        order_gifts: [],
        order_actions: [],
        order_consignments: [],
      },
    ],
  };
};

export const sendSmartupOrder = async (config, payload) => {
  const smartupPayload = buildSmartupOrderPayload(config, payload);
  const data = await requestSmartup(
    config,
    "/b/trade/txs/tdeal/order$import",
    smartupPayload,
    "Smartup order API rejected the request.",
  );

  return {
    status: true,
    result: data,
  };
};
