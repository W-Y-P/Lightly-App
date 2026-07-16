/**
 * Cloud environment configuration.
 *
 * The checked-in mini program targets the project's CloudBase environment.
 * For another environment, replace `cloudEnvId` or enable dynamic mode.
 *
 * If you need to pin a specific environment (for example production), set
 * `cloudEnvId` to that environment id (e.g. 'prod-xxx').
 */
export const cloudEnvId = 'cloud1-d0gkjbgmncb3b9f04'

export const useDynamicCloudEnv = false

export const useHttpFallback = false

export function isCloudConfigured() {
  return Boolean(cloudEnvId || useDynamicCloudEnv)
}
