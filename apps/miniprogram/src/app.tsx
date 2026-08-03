import { PropsWithChildren, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { useLaunch } from '@tarojs/taro'
import { ensureAuthReady } from './api/client'
import { cloudEnvId, isCloudConfigured } from './config/cloud'
import './app.scss'

function App({ children }: PropsWithChildren) {
  const [privacyVisible, setPrivacyVisible] = useState(false)
  const privacyResolver = useRef<((result: { event: 'agree' | 'disagree'; buttonId?: string }) => void) | null>(null)

  useLaunch(() => {
    try {
      if (isCloudConfigured() && typeof wx !== 'undefined' && wx.cloud) {
        wx.cloud.init({
          env: cloudEnvId || undefined,
          traceUser: true,
        })
      } else {
        console.info('[App] wx.cloud disabled; using fallback data path')
      }
    } catch (e) {
      console.warn('[App] wx.cloud.init fallback:', e)
    }

    ensureAuthReady()

    const wechat = typeof wx !== 'undefined' ? wx as any : null
    if (wechat && typeof wechat.onNeedPrivacyAuthorization === 'function') {
      wechat.onNeedPrivacyAuthorization((resolve: typeof privacyResolver.current) => {
        privacyResolver.current = resolve
        setPrivacyVisible(true)
      })
    }
  })

  const finishPrivacy = (agreed: boolean) => {
    privacyResolver.current?.(agreed
      ? { event: 'agree', buttonId: 'privacy-agree' }
      : { event: 'disagree' })
    privacyResolver.current = null
    setPrivacyVisible(false)
  }

  return (
    <>
      {children}
      {privacyVisible ? (
        <View className='app-privacy-layer' catchMove>
          <View className='app-privacy-panel'>
            <Text className='app-privacy-title'>隐私保护提示</Text>
            <Text className='app-privacy-copy'>拍照识别需要访问你选择的图片。图片仅用于本次 AI 识别，确认前不会写入饮食记录。</Text>
            <View className='app-privacy-actions'>
              <View className='app-privacy-cancel' onClick={() => finishPrivacy(false)}><Text>暂不使用</Text></View>
              <Button
                id='privacy-agree'
                className='app-privacy-agree'
                openType='agreePrivacyAuthorization'
                onAgreePrivacyAuthorization={() => finishPrivacy(true)}
              >
                同意并继续
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </>
  )
}

export default App
