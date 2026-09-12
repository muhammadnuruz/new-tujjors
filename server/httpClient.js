import http from "node:http";
import https from "node:https";

/**
 * A minimal fetch()-compatible client built on Node's core http/https modules
 * with `insecureHTTPParser: true`.
 *
 * Some upstreams (notably the SalesDoc API) return non-RFC-compliant HTTP:
 * trailing bytes after `Connection: close`. Node's global fetch (undici) has no
 * lenient-parser option and, when it hits that garbage after the body is already
 * delivered, raises a parser error at the native layer that escapes every JS
 * `try/catch` and even `process.on('uncaughtException')`, killing the process.
 *
 * The core http parser accepts `insecureHTTPParser`, which tolerates exactly
 * this violation, so requests routed through here never crash the server. Any
 * transport error is surfaced as a normal promise rejection the callers already
 * handle.
 *
 * Only the subset of the Response API used in this codebase is implemented:
 *   response.ok, response.status, response.headers.get(name), await response.text()
 */
export const insecureFetch = (url, { method = "GET", headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const target = url instanceof URL ? url : new URL(String(url));
    const transport = target.protocol === "http:" ? http : https;

    const hasBody = body !== undefined && body !== null;
    const payload = hasBody
      ? Buffer.isBuffer(body)
        ? body
        : Buffer.from(String(body))
      : null;
    const finalHeaders = payload
      ? { "Content-Length": Buffer.byteLength(payload), ...headers }
      : headers;

    const request = transport.request(
      target,
      {
        method,
        headers: finalHeaders,
        insecureHTTPParser: true,
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode || 0;

          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: {
              get: (name) => response.headers[String(name).toLowerCase()] ?? null,
            },
            text: async () => text,
          });
        });
      },
    );

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
