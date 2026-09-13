import 'server-only';
import { createHash, createHmac } from 'node:crypto';

export type R2Object = { body: Buffer; contentType: string | null; contentLength: number | null; etag: string | null };
export type R2Client = {
  presignPut(key: string, input: { contentType: string; expiresInSeconds: number }): Promise<string>;
  presignGet(key: string, input: { expiresInSeconds: number; download?: boolean }): Promise<string>;
  headObject(key: string): Promise<{ contentType: string | null; contentLength: number | null; etag: string | null }>;
  getObject(key: string): Promise<R2Object>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  listObjects(input: { prefix: string; maxKeys: number; continuationToken?: string }): Promise<{ objects: Array<{ key: string; size: number; etag: string | null }>; nextCursor: string | null }>;
};

type R2Config = { endpoint: string; accessKeyId: string; secretAccessKey: string; bucketName: string };
const REGION = 'auto';
const SERVICE = 's3';

function config(environment = process.env): R2Config {
  const accountId = environment.R2_ACCOUNT_ID;
  const accessKeyId = environment.R2_ACCESS_KEY_ID;
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY;
  const bucketName = environment.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME are required');
  return { endpoint: `https://${accountId}.r2.cloudflarestorage.com`, accessKeyId, secretAccessKey, bucketName };
}

function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function hmac(key: Buffer | string, value: string): Buffer { return createHmac('sha256', key).update(value).digest(); }
function encode(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }
function amzDate(date: Date): { short: string; long: string } {
  const iso = date.toISOString().replace(/[-:]|\.\d{3}/g, '');
  return { short: iso.slice(0, 8), long: iso.slice(0, 15) + 'Z' };
}

function signingKey(secret: string, date: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), REGION), SERVICE), 'aws4_request');
}

function presignedUrl(settings: R2Config, method: 'GET' | 'HEAD' | 'PUT' | 'DELETE', key: string, expiresInSeconds: number, extraQuery: Record<string, string> = {}): string {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) throw new Error('R2 presign expiry must be between 1 and 900 seconds');
  const now = new Date();
  const dates = amzDate(now);
  const host = new URL(settings.endpoint).host;
  const credential = `${settings.accessKeyId}/${dates.short}/${REGION}/${SERVICE}/aws4_request`;
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': credential, 'X-Amz-Date': dates.long,
    'X-Amz-Expires': String(expiresInSeconds), 'X-Amz-SignedHeaders': 'host',
    ...extraQuery,
  };
  const canonicalQuery = Object.entries(query).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${encode(name)}=${encode(value)}`).join('&');
  const path = `/${encode(settings.bucketName)}/${key.split('/').map(encode).join('/')}`;
  const canonicalRequest = [method, path, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${dates.short}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dates.long, scope, hash(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(settings.secretAccessKey, dates.short)).update(stringToSign).digest('hex');
  return `${settings.endpoint}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function assertSafeObjectKey(key: string): void {
  if (!key || key.startsWith('/') || key.endsWith('/') || key.includes('\\') || /(^|\/)\.\.?($|\/)/.test(key) || /[\u0000-\u001f\u007f]/.test(key)) throw new Error('INVALID_R2_OBJECT_KEY');
}

function decodeXml(value: string): string {
  return value.replace(/&quot;|&amp;|&lt;|&gt;|&#39;|&#x27;|&#(\d+);/g, (entity, decimal) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    return ({ '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#x27;': "'" } as Record<string, string>)[entity] ?? entity;
  });
}

function xmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1]) : null;
}

function parseListBucketResponse(xml: string): { objects: Array<{ key: string; size: number; etag: string | null }>; nextCursor: string | null } {
  const objects: Array<{ key: string; size: number; etag: string | null }> = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = xmlValue(match[1], 'Key');
    if (!key) continue;
    const rawEtag = xmlValue(match[1], 'ETag');
    objects.push({ key, size: Number(xmlValue(match[1], 'Size') ?? 0), etag: rawEtag?.replace(/^"|"$/g, '') || null });
  }
  return { objects, nextCursor: xmlValue(xml, 'NextContinuationToken') };
}

async function request(settings: R2Config, method: 'GET' | 'HEAD' | 'PUT' | 'DELETE', key: string, body?: Buffer, contentType?: string): Promise<Response> {
  assertSafeObjectKey(key);
  const url = presignedUrl(settings, method, key, 900);
  const response = await fetch(url, { method, headers: contentType ? { 'content-type': contentType } : undefined, body: body ? new Uint8Array(body) : undefined });
  if (!response.ok) throw new Error(`R2_${method}_FAILED_${response.status}`);
  return response;
}

export function createR2Client(environment = process.env): R2Client {
  const settings = config(environment);
  return {
    presignPut: async (key, input) => {
      assertSafeObjectKey(key);
      return presignedUrl(settings, 'PUT', key, input.expiresInSeconds);
    },
    presignGet: async (key, input) => { assertSafeObjectKey(key); return presignedUrl(settings, 'GET', key, input.expiresInSeconds); },
    async headObject(key) {
      const response = await request(settings, 'HEAD', key);
      return { contentType: response.headers.get('content-type'), contentLength: Number(response.headers.get('content-length')) || null, etag: response.headers.get('etag') };
    },
    async getObject(key) {
      const response = await request(settings, 'GET', key);
      return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type'), contentLength: Number(response.headers.get('content-length')) || null, etag: response.headers.get('etag') };
    },
    async putObject(key, body, contentType) { await request(settings, 'PUT', key, body, contentType); },
    async deleteObject(key) { await request(settings, 'DELETE', key); },
    async listObjects({ prefix, maxKeys, continuationToken }) {
      if (!prefix || prefix.startsWith('/') || prefix.includes('\\') || /[\u0000-\u001f\u007f]/.test(prefix)) throw new Error('INVALID_R2_LIST_PREFIX');
      if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000) throw new Error('R2_LIST_MAX_KEYS_INVALID');
      const extraQuery: Record<string, string> = { 'list-type': '2', prefix, 'max-keys': String(maxKeys) };
      if (continuationToken) extraQuery['continuation-token'] = continuationToken;
      const url = presignedUrl(settings, 'GET', '', 900, extraQuery);
      const response = await fetch(url, { method: 'GET', headers: undefined, body: undefined });
      if (!response.ok) throw new Error(`R2_LIST_FAILED_${response.status}`);
      return parseListBucketResponse(await response.text());
    },
  };
}
