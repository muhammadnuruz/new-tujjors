import { insecureFetch } from "./httpClient.js";

const defaultPriceTypeId = "d0_2";
const defaultSmartupServerName = "https://smartup.online";
const defaultSmartupProjectCode = "trade";
const defaultSmartupLogin = "азамат@buxoroozod";
const defaultSmartupPassword = "020202";
const smartupConfigKeys = {
  login: ["smartup_login", "smartupLogin", "SMARTUP_LOGIN"],
  password: ["smartup_password", "smartupPassword", "SMARTUP_PASSWORD"],
  serverName: ["smartup_server_name", "smartupServerName", "server_name", "serverName"],
  projectCode: ["smartup_project_code", "smartupProjectCode", "project_code", "projectCode"],
  // priceTypeCode: ["smartup_price_type_code", "smartupPriceTypeCode", "price_type_code", "priceTypeCode"],
  warehouseCode: ["smartup_warehouse_code", "smartupWarehouseCode", "warehouse_code", "warehouseCode"],
  filialId: ["smartup_filial_id", "smartupFilialId", "filial_id", "filialId"],
  filialCode: ["smartup_filial_code", "smartupFilialCode", "filial_code", "filialCode"],
  roomCode: ["smartup_room_code", "smartupRoomCode", "room_code", "roomCode"],
  robotCode: ["smartup_robot_code", "smartupRobotCode", "robot_code", "robotCode"],
  personCode: ["smartup_person_code", "smartupPersonCode", "person_code", "personCode"],
  salesManagerCode: [
    "smartup_sales_manager_code",
    "smartupSalesManagerCode",
    "sales_manager_code",
    "salesManagerCode",
  ],
  currencyCode: ["smartup_currency_code", "smartupCurrencyCode", "currency_code", "currencyCode"],
};

/**
 * Cleans text and decodes Unicode escape sequences (e.g., \u0430 -> а)
 */
const compactText = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();

  // If the string contains a backslash, it likely has escape sequences
  if (trimmed.includes('\\')) {
    try {
      // JSON.parse trick to evaluate escape sequences like \u0430
      return JSON.parse(`"${trimmed}"`);
    } catch (e) {
      return trimmed;
    }
  }
  return trimmed;
};

export const isSmartupDealerId = (value) => {
  const dealerId = resolveDealerId(value);
  // Logic: 11 characters long AND ends with the character '0'
  return dealerId.length === 11 && dealerId.endsWith("0");
};

export const isSalesDocDealerId = (value) => {
  const dealerId = resolveDealerId(value);
  return dealerId.length === 10;
};

const normalizeBaseUrl = (value) => {
  const baseUrl = compactText(value);
  if (!baseUrl) {
    throw new Error("Set DEALER_API_BASE_URL before starting the server.");
  }
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

export const getDealerApiBaseUrl = () =>
  compactText(process.env.DEALER_API_BASE_URL) || "https://tujjors.uz";

const readJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const stripHtml = (value) =>
  compactText(value)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const readHtmlErrorMessage = (html) => {
  const text = stripHtml(html);
  if (text.includes("Server Error (500)")) return "tujjors.uz dealer info API returned Server Error (500).";
  if (/продавец не найден/i.test(text)) return "Dealer not found or expired in tujjors.uz.";
  return text ? text.slice(0, 300) : "";
};

const readErrorMessage = (payload, fallbackMessage) => {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  if (typeof payload?.detail === "string" && payload.detail.trim()) return payload.detail.trim();
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload?.raw === "string" && payload.raw.trim()) return readHtmlErrorMessage(payload.raw) || fallbackMessage;
  return fallbackMessage;
};

const fetchDealerInfo = async (baseUrl, dealerId) => {
  const endpoint = new URL(`api/dealers/info/${dealerId}/`, baseUrl);
  const response = await insecureFetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await readJsonResponse(response);

  return { response, data, endpoint };
};

export const resolveDealerId = (value) => {
  if (typeof value === "string" || typeof value === "number") return compactText(String(value));
  return compactText(value?.dealerId || value?.dealer_id || value?.link);
};

const readFirstText = (source, keys) => {
  for (const key of keys) {
    const value = compactText(source?.[key]);

    if (value) return value;
  }

  return "";
};

const deriveSmartupProjectCode = (login) => {
  const [, projectCode] = compactText(login).split("@");

  return compactText(projectCode);
};

export const fetchDealerConfig = async (dealerId) => {
  const resolvedDealerId = resolveDealerId(dealerId);

  if (!resolvedDealerId) {
    throw new Error("Dealer ID is required.");
  }

  const baseUrl = normalizeBaseUrl(getDealerApiBaseUrl());
  let response = null;
  let data = null;

  try {
    const dealerInfo = await fetchDealerInfo(baseUrl, resolvedDealerId);

    response = dealerInfo.response;
    data = dealerInfo.data;
  } catch (error) {
    if (!isSmartupDealerId(resolvedDealerId)) throw error;
  }

  if (response && !response.ok && !isSmartupDealerId(resolvedDealerId)) {
    const error = new Error(
      readErrorMessage(data, `Dealer info API rejected the request with status ${response.status}.`)
    );
    error.statusCode = response.status;
    error.responsePayload = data;
    throw error;
  }

  // --- SMARTUP INTEGRATION PATH ---
  if (isSmartupDealerId(resolvedDealerId)) {
    // const salesDocDealerId = resolvedDealerId.slice(0, -1);
    // let salesDocDealerData = null;

    // try {
    //   const salesDocDealerInfo = await fetchDealerInfo(baseUrl, salesDocDealerId);

    //   if (salesDocDealerInfo.response.ok) {
    //     salesDocDealerData = salesDocDealerInfo.data;
    //   } else {
    //     console.warn("Smartup paired SalesDoc dealer info API rejected the request.", {
    //       smartupDealerId: resolvedDealerId,
    //       salesDocDealerId,
    //       status: salesDocDealerInfo.response.status,
    //       details: readErrorMessage(
    //         salesDocDealerInfo.data,
    //         `Dealer info API rejected the request with status ${salesDocDealerInfo.response.status}.`,
    //       ),
    //     });
    //   }
    // } catch (error) {
    //   console.warn("Smartup paired SalesDoc dealer info API request failed.", {
    //     smartupDealerId: resolvedDealerId,
    //     salesDocDealerId,
    //     details: error instanceof Error ? error.message : "Unknown error",
    //   });
    // }

    // const pairedSalesDocPriceType = compactText(salesDocDealerData?.price_type);
    const login =
      readFirstText(data, smartupConfigKeys.login) ||
      compactText(data?.login) ||
      compactText(data?.username) ||
      compactText(process.env.SMARTUP_LOGIN) ||
      defaultSmartupLogin;
    const password =
      readFirstText(data, smartupConfigKeys.password) ||
      compactText(data?.password) ||
      compactText(process.env.SMARTUP_PASSWORD) ||
      defaultSmartupPassword;

    if (!login || !password) {
      throw new Error("Smartup login and password are required.");
    }

    const smartupConfig = {
      dealerId: resolvedDealerId,
      integration: "smartup",
      serverName:
        readFirstText(data, smartupConfigKeys.serverName) ||
        compactText(data?.url) ||
        compactText(process.env.SMARTUP_SERVER_NAME) ||
        defaultSmartupServerName,
      login,
      password,
      projectCode:
        readFirstText(data, smartupConfigKeys.projectCode) ||
        compactText(process.env.SMARTUP_PROJECT_CODE) ||
        deriveSmartupProjectCode(login) ||
        defaultSmartupProjectCode,
      // Keep Smartup price type empty so Smartup returns its default prices.
      priceTypeCode: "",
      // priceTypeCode:
      //   pairedSalesDocPriceType ||
      //   compactText(process.env.SMARTUP_PRICE_TYPE_CODE) ||
      //   readFirstText(data, smartupConfigKeys.priceTypeCode) ||
      //   compactText(data?.price_type),
      warehouseCode:
        compactText(process.env.SMARTUP_WAREHOUSE_CODE) ||
        readFirstText(data, smartupConfigKeys.warehouseCode),
      filialId:
        compactText(process.env.SMARTUP_FILIAL_ID) ||
        readFirstText(data, smartupConfigKeys.filialId),
      filialCode:
        compactText(process.env.SMARTUP_FILIAL_CODE) ||
        readFirstText(data, smartupConfigKeys.filialCode),
      roomCode:
        compactText(process.env.SMARTUP_ROOM_CODE) ||
        readFirstText(data, smartupConfigKeys.roomCode),
      robotCode:
        compactText(process.env.SMARTUP_ROBOT_CODE) ||
        readFirstText(data, smartupConfigKeys.robotCode),
      personCode:
        compactText(process.env.SMARTUP_PERSON_CODE) ||
        readFirstText(data, smartupConfigKeys.personCode),
      salesManagerCode:
        compactText(process.env.SMARTUP_SALES_MANAGER_CODE) ||
        readFirstText(data, smartupConfigKeys.salesManagerCode),
      currencyCode:
        compactText(process.env.SMARTUP_CURRENCY_CODE) ||
        readFirstText(data, smartupConfigKeys.currencyCode) ||
        "860",
    };

    // View your cleaned credentials here
    console.log("✅ Smartup Config Processed:", { 
      login: smartupConfig.login, 
      password: smartupConfig.password,
      serverName: smartupConfig.serverName,
      projectCode: smartupConfig.projectCode,
      // priceTypeCode: smartupConfig.priceTypeCode,
      // pairedSalesDocDealerId: salesDocDealerId,
    });

    return smartupConfig;
  }

  // --- SALESDOC INTEGRATION PATH ---
  const salesDocBaseUrl = compactText(data?.url);
  const login = compactText(data?.login);
  const password = compactText(data?.password);
  const priceTypeId = compactText(data?.price_type) || defaultPriceTypeId;
  const discountPriceTypeId = compactText(data?.discount_price_type);

  if (!salesDocBaseUrl || !login || !password) {
    throw new Error("Dealer info API returned incomplete SalesDoc credentials.");
  }

  const salesDocConfig = {
    dealerId: resolvedDealerId,
    integration: "salesdoc",
    salesDocBaseUrl,
    login,
    password,
    priceTypeId,
    discountPriceTypeId,
  };

  // View your cleaned credentials here
  console.log("✅ SalesDoc Config Processed:", { 
    login: salesDocConfig.login, 
    password: salesDocConfig.password 
  });

  return salesDocConfig;
};
