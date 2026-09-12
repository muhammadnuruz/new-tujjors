import app from './app.js'
import { getDealerApiBaseUrl } from './dealerApi.js'

// Some upstream integrations (e.g. SalesDoc) return non-RFC-compliant HTTP:
// they send trailing bytes after `Connection: close`, once the response body
// has already been delivered to the awaiting fetch() call. undici surfaces that
// as a socket-level HTTP parser error with no promise left to reject, so it
// escapes every route-level try/catch and reaches the process as an uncaught
// error — crashing the server (and looping under pm2) even though the client
// already got its data. Swallow only that specific parser error; keep
// fail-fast behavior for everything else.
const isHttpParseError = (error) => {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  const causeCode = String(error?.cause?.code || '')
  const causeMessage = String(error?.cause?.message || '')
  return (
    code.startsWith('HPE_') ||
    causeCode.startsWith('HPE_') ||
    /Parse Error/i.test(message) ||
    /Parse Error/i.test(causeMessage)
  )
}

process.on('uncaughtException', (error) => {
  if (isHttpParseError(error)) {
    console.warn(
      '[Ignored] Malformed upstream HTTP response after body was delivered:',
      error?.message || error,
    )
    return
  }
  console.error('Fatal uncaughtException:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  if (isHttpParseError(reason)) {
    console.warn(
      '[Ignored] Malformed upstream HTTP response (rejection):',
      reason?.message || reason,
    )
    return
  }
  console.error('Fatal unhandledRejection:', reason)
  process.exit(1)
})

const port = Number(process.env.PORT) || 3000
const isDealerApiBaseUrlFromEnv = Boolean(process.env.DEALER_API_BASE_URL?.trim())

app.listen(port, () => {
  console.log(`SalesDoc proxy running at http://localhost:${port}`)
  console.log(
    `Dealer API base URL: ${getDealerApiBaseUrl()} (${isDealerApiBaseUrlFromEnv ? 'from DEALER_API_BASE_URL' : 'fallback default'})`,
  )
})
