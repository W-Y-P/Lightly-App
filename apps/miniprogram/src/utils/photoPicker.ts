import Taro from '@tarojs/taro'

export type PhotoSource = 'camera' | 'album'

export interface PickedPhoto {
  tempFilePath: string
  fileType?: string
}

interface NativePhotoApi {
  requirePrivacyAuthorize?: (options: {
    success: () => void
    fail: (error: unknown) => void
  }) => void
  chooseImage?: (options: {
    count: number
    sourceType: PhotoSource[]
    sizeType: Array<'compressed'>
    success: (result: {
      tempFilePaths?: string[]
      tempFiles?: Array<{ path?: string }>
    }) => void
    fail: (error: unknown) => void
  }) => void
}

export function photoPickerErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: unknown }).errMsg || '')
  }
  return error instanceof Error ? error.message : String(error || '')
}

function photoPickerErrorCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = (error as { errNo?: unknown; errno?: unknown }).errNo
    ?? (error as { errno?: unknown }).errno
  const code = Number(value)
  return Number.isFinite(code) ? code : null
}

export function isPhotoPickerCancel(error: unknown): boolean {
  return /cancel|取消/i.test(photoPickerErrorMessage(error))
}

export function describePhotoPickerError(error: unknown, source: PhotoSource): string {
  const message = photoPickerErrorMessage(error)
  const code = photoPickerErrorCode(error)
  if (code === 112 || /scope is not declared|privacy contract not found|privacy agreement|api scope.*not declared|appid privacy api banned|隐私.*声明|未声明/i.test(message)) {
    return '请先在微信公众平台的用户隐私保护指引中声明“选中的照片或视频”用途'
  }
  if (code === 103 || code === 104 || /auth deny|permission.*not authorized|authorize.*fail|denied|拒绝|权限/i.test(message)) {
    return source === 'camera'
      ? '没有相机权限，请在微信设置中允许使用相机后重试'
      : '没有相册权限，请在系统设置中允许微信访问照片后重试'
  }
  if (/not support|not found|not implemented|invalid api|system.*support|不支持/i.test(message)) {
    return source === 'camera'
      ? '开发者工具无法调用电脑相机，请使用真机预览，或先从相册选择图片'
      : '当前环境无法打开相册，请在真机上重试'
  }
  return source === 'camera' ? '相机没有成功打开，请重试' : '相册没有成功打开，请重试'
}

export function isPhotoPickerError(error: unknown): boolean {
  return /chooseMedia|chooseImage|requirePrivacyAuthorize|permission|authorize|auth deny|not support|invalid api|privacy|scope/i.test(photoPickerErrorMessage(error))
}

export function detectPhotoMimeType(imageBase64: string): string | null {
  try {
    const bytes = new Uint8Array(Taro.base64ToArrayBuffer(imageBase64))
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
    if (bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  } catch {
    return null
  }
  return null
}

function getNativePhotoApi(): NativePhotoApi | null {
  if (typeof wx === 'undefined') return null
  return wx as unknown as NativePhotoApi
}

async function requirePhotoPrivacyAuthorization(): Promise<void> {
  const nativeApi = getNativePhotoApi()
  if (!nativeApi?.requirePrivacyAuthorize) return

  await new Promise<void>((resolve, reject) => {
    nativeApi.requirePrivacyAuthorize?.({
      success: resolve,
      fail: reject,
    })
  })
}

async function chooseWithImageApi(source: PhotoSource): Promise<PickedPhoto> {
  const nativeApi = getNativePhotoApi()
  if (nativeApi?.chooseImage) {
    return new Promise<PickedPhoto>((resolve, reject) => {
      nativeApi.chooseImage?.({
        count: 1,
        sourceType: [source],
        sizeType: ['compressed'],
        success: (result) => {
          const first = result.tempFiles?.[0]
          const tempFilePath = first?.path || result.tempFilePaths?.[0] || ''
          if (!tempFilePath) {
            reject(new Error('chooseImage:fail no temp file'))
            return
          }
          resolve({ tempFilePath, fileType: 'image' })
        },
        fail: reject,
      })
    })
  }

  const result = await Taro.chooseImage({
    count: 1,
    sourceType: [source],
    sizeType: ['compressed'],
  })
  const first = result.tempFiles?.[0]
  const tempFilePath = first?.path || result.tempFilePaths?.[0] || ''
  if (!tempFilePath) throw new Error('chooseImage:fail no temp file')
  return { tempFilePath, fileType: 'image' }
}

export async function pickSinglePhoto(source: PhotoSource): Promise<PickedPhoto> {
  await requirePhotoPrivacyAuthorization()
  return chooseWithImageApi(source)
}
