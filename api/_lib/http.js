export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  return JSON.parse(text)
}

export function getQueryParam(req, key) {
  if (req.query && req.query[key] !== undefined) {
    return req.query[key]
  }
  const url = new URL(req.url, 'http://localhost')
  return url.searchParams.get(key)
}

export function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}
