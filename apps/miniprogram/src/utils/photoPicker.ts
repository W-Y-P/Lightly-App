import Taro from '@tarojs/taro'

export type PhotoSource = 'camera' | 'album'

export interface PickedPhoto {
  tempFilePath: string
  fileType?: string
}

export function photoPickerErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: unknown }).errMsg || '')
  }
  return error instanceof Error ? error.message : String(error || '')
}

export function isPhotoPickerCancel(error: unknown): boolean {
  return /cancel|取消/i.test(photoPickerErrorMessage(error))
}

export function describePhotoPickerError(error: unknown, source: PhotoSource): string {
  const message = photoPickerErrorMessage(error)
  if (/scope is not declared|privacy agreement|隐私.*声明|未声明/i.test(message)) {
    return '请先在微信公众平台的用户隐私保护指引中声明“选中的照片或视频”用途'
  }
  if (/auth deny|permission|authorize|denied|拒绝|权限/i.test(message)) {
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
  return /chooseMedia|chooseImage|permission|authorize|auth deny|not support|invalid api|privacy|scope/i.test(photoPickerErrorMessage(error))
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

function canFallbackToChooseImage(error: unknown): boolean {
  return /not support|not found|not implemented|invalid api|system.*support|不支持/i.test(photoPickerErrorMessage(error))
}

async function chooseWithLegacyApi(source: PhotoSource): Promise<PickedPhoto> {
  const result = await Taro.chooseImage({
    count: 1,
    sourceType: [source],
    sizeType: ['compressed'],
  })
  const first = result.tempFiles?.[0]
  const tempFilePath = first?.path || result.tempFilePaths?.[0] || ''
  return { tempFilePath, fileType: 'image' }
}

export async function pickSinglePhoto(source: PhotoSource): Promise<PickedPhoto> {
  if (Taro.canIUse('chooseMedia')) {
    try {
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: [source],
        sizeType: ['compressed'],
        camera: 'back',
      })
      const first = result.tempFiles?.[0]
      return {
        tempFilePath: first?.tempFilePath || '',
        fileType: first?.fileType || result.type,
      }
    } catch (error) {
      if (isPhotoPickerCancel(error) || !canFallbackToChooseImage(error)) throw error
    }
  }
  return chooseWithLegacyApi(source)
}
