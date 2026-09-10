export type QuotaIntegrationConfig =
  | { kind: 'ready'; supabaseUrl: string; serviceRoleKey: string }
  | { kind: 'skip'; reason: string };

const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);
const missingLocalConfigurationReason =
  'requires SUPABASE_ENV=local, a localhost or 127.0.0.1 SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY';

export function resolveQuotaIntegrationConfig(
  environment: Readonly<Record<string, string | undefined>>,
): QuotaIntegrationConfig {
  const supabaseEnvironment = environment.SUPABASE_ENV?.trim();
  const configuredUrl = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (supabaseEnvironment && supabaseEnvironment !== 'local') {
    throw new Error('Refusing quota integration database writes: SUPABASE_ENV must be exactly "local".');
  }

  let parsedUrl: URL | undefined;
  if (configuredUrl) {
    try {
      parsedUrl = new URL(configuredUrl);
    } catch {
      throw new Error('Refusing quota integration database writes: SUPABASE_URL must be a valid HTTP URL.');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Refusing quota integration database writes: SUPABASE_URL must be a valid HTTP URL.');
    }

    if (!localHostnames.has(parsedUrl.hostname)) {
      throw new Error('Refusing quota integration database writes: SUPABASE_URL must target localhost or 127.0.0.1.');
    }
  }

  if (supabaseEnvironment !== 'local' || !parsedUrl || !serviceRoleKey) {
    return { kind: 'skip', reason: missingLocalConfigurationReason };
  }

  return {
    kind: 'ready',
    serviceRoleKey,
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ''),
  };
}
