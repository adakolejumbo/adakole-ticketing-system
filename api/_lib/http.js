export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && !(Buffer.isBuffer(req.body) && !req.body.length)) {
    if (typeof req.body === 'string') return parse(req.body, req);
    if (Buffer.isBuffer(req.body)) return parse(req.body.toString(), req);
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return parse(Buffer.concat(chunks).toString(), req);
}

function parse(raw, req) {
  if (!raw) return {};
  const type = req.headers['content-type'] || '';
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function need(obj, ...fields) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === '') {
      throw new HttpError(400, `${f.replace(/_/g, ' ')} is required`);
    }
  }
}
