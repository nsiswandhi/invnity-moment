export type SmokeCheck = { name: string; url: string; ok: boolean; status?: number; error?: string };
export type SmokeReport = { baseUrl: string; reachable: boolean; passed: boolean; checks: SmokeCheck[] };

const smokePaths = [
  ['landing', '/'],
  ['public album', '/album'],
  ['public album API', '/api/v1/moments?limit=1'],
] as const;

export async function runProductionSmokeTest(baseUrl: string, fetcher: typeof fetch = globalThis.fetch): Promise<SmokeReport> {
  let origin: URL;
  try {
    origin = new URL(baseUrl);
    if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('unsupported protocol');
  } catch {
    return { baseUrl, reachable: false, passed: false, checks: [{ name: 'target', url: baseUrl, ok: false, error: 'SMOKE_BASE_URL_INVALID' }] };
  }
  const checks: SmokeCheck[] = [];
  for (const [name, path] of smokePaths) {
    const url = new URL(path, origin).toString();
    try {
      const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
      checks.push({ name, url, ok: response.ok, status: response.status, ...(response.ok ? {} : { error: `HTTP_${response.status}` }) });
    } catch (error) {
      checks.push({ name, url, ok: false, error: error instanceof Error ? error.message : 'SMOKE_REQUEST_FAILED' });
    }
  }
  const reachable = checks.some((check) => check.status !== undefined);
  return { baseUrl: origin.origin, reachable, passed: reachable && checks.every((check) => check.ok), checks };
}

async function main(): Promise<void> {
  const baseUrl = process.env.SMOKE_BASE_URL;
  const report = await runProductionSmokeTest(baseUrl ?? '');
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('smoke-production.ts')) main().catch(() => { process.stderr.write('Production smoke test failed.\n'); process.exitCode = 1; });
