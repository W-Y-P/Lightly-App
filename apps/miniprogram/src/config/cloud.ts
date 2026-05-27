/**
 * Cloud environment configuration.
 *
 * Keep cloud disabled by default so the demo can run under touristappid or a
 * DevTools project without CloudBase enabled. For a real WeChat cloud deploy,
 * either set `cloudEnvId` or explicitly enable dynamic environment mode.
 *
 * If you need to pin a specific environment (for example production), set
 * `cloudEnvId` to that environment id (e.g. 'prod-xxx').
 */
export const cloudEnvId = ''

export const useDynamicCloudEnv = false

export const useHttpFallback = false

export function isCloudConfigured() {
  return Boolean(cloudEnvId || useDynamicCloudEnv)
}
