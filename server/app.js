import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchDealerConfig, resolveDealerId } from "./dealerApi.js";
import { sendDealerOrder } from "./dealerOrder.js";
import { fetchSalesDocCatalog } from "./salesDoc.js";
import { fetchSmartupCatalog } from "./smartup.js";
import { getOrSet } from "./cache.js";

const CATALOG_CACHE_TTL_SECONDS = Number(process.env.CATALOG_CACHE_TTL_SECONDS || 300);

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");
const indexHtmlPath = path.join(distPath, "index.html");

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/salesdoc/login", (_request, response) => {
  response.status(404).json({
    status: false,
    error: "Not Found",
  });
});

app.post("/api/salesdoc/products", async (request, response) => {
  let dealerConfig = null;

  try {
    dealerConfig = await fetchDealerConfig(resolveDealerId(request.body || {}));
    console.info("[Dealer catalog] resolved integration", {
      dealerId: dealerConfig.dealerId,
      integration: dealerConfig.integration,
      // priceTypeCode: dealerConfig.priceTypeCode,
    });

    const cacheKey = `catalog:${dealerConfig.integration}:${dealerConfig.dealerId}`;
    const data = await getOrSet(cacheKey, CATALOG_CACHE_TTL_SECONDS, () =>
      dealerConfig.integration === "smartup"
        ? fetchSmartupCatalog(dealerConfig)
        : fetchSalesDocCatalog(dealerConfig),
    );

    response.json({ ...data, bonus: dealerConfig.bonus || null });
  } catch (error) {
    const integrationName = dealerConfig?.integration === "smartup" ? "Smartup" : "SalesDoc";

    response.status(error?.statusCode || 500).json({
      status: false,
      error: `Failed to fetch ${integrationName} catalog`,
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/dealers/send-order", async (request, response) => {
  try {
    const data = await sendDealerOrder(request.body || {});

    response.json(data);
  } catch (error) {
    response.status(error?.statusCode || 500).json({
      status: false,
      error: "Failed to send dealer order",
      details: error instanceof Error ? error.message : "Unknown error",
      upstream: error?.responsePayload || null,
    });
  }
});

if (existsSync(indexHtmlPath)) {
  app.use(express.static(distPath));

  app.get(/.*/, (_request, response) => {
    response.sendFile(indexHtmlPath);
  });
}

export default app;
