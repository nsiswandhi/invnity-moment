import 'server-only';
import { z } from 'zod';

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
});
const publicSchema = z.object({ NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000') });

export function getServerConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const result = serverSchema.safeParse({ ...process.env });
  if (!result.success && isProduction) throw new Error(`Invalid server configuration: ${result.error.message}`);
  if (!result.success) return { nodeEnv: process.env.NODE_ENV ?? 'development', r2: null, sessionSecret: null } as const;
  return { nodeEnv: result.data.NODE_ENV, r2: { accountId: result.data.R2_ACCOUNT_ID, accessKeyId: result.data.R2_ACCESS_KEY_ID, secretAccessKey: result.data.R2_SECRET_ACCESS_KEY, bucketName: result.data.R2_BUCKET_NAME }, sessionSecret: result.data.SESSION_SECRET } as const;
}

export function getPublicConfig() {
  const result = publicSchema.parse({ ...process.env });
  return { appUrl: result.NEXT_PUBLIC_APP_URL };
}
