/** Turns a raw error (network/API/JSON-parse text) into plain language for a non-technical
 *  reader, since this app's whole premise is hiding technical mess behind simple UI. Falls
 *  back to the original message when nothing more specific matches. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)

  if (/No OpenRouter API key configured/i.test(raw)) {
    return raw // already plain
  }
  if (/401/.test(raw) && /OpenRouter/i.test(raw)) {
    return "Your OpenRouter API key was rejected. Double-check it in Settings — it may be wrong or expired."
  }
  if (/429/.test(raw) && /OpenRouter/i.test(raw)) {
    return "OpenRouter is rate-limiting requests right now. Wait a moment and try again."
  }
  if (/402/.test(raw) && /OpenRouter/i.test(raw)) {
    return "OpenRouter says there's no credit left on this account. Add credit at openrouter.ai."
  }
  // A real HTTP response came back from OpenRouter (any status) — the request reached the
  // internet fine, so this is never a connectivity problem. Surface what actually went wrong.
  const httpMatch = raw.match(/(?:OpenRouter request failed|Failed to fetch models):\s*(\d{3})\s*(.*)/is)
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10)
    const body = httpMatch[2]
    if (status === 400 || status === 404) {
      return "That model isn't available on OpenRouter right now (it may have been renamed or retired) — pick a different one in the model settings."
    }
    if (status >= 500) {
      return "OpenRouter is having trouble on its end right now. Try again in a bit."
    }
    return `OpenRouter returned an error (${status}): ${body.slice(0, 200) || 'no further details'}`
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
    return "Couldn't connect to the internet. Check your connection and try again."
  }
  if (/Unexpected token|is not valid JSON|JSON at position/i.test(raw)) {
    return "That file doesn't look like a valid export — make sure you picked the right one."
  }
  if (/OS-level encryption is not available/i.test(raw)) {
    return raw
  }

  return raw
}
