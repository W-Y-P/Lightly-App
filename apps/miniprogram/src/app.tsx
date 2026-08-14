import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { ensureAuthReady } from './api/client'
import { cloudEnvId, isCloudConfigured } from './config/cloud'
import './app.scss'

function App({ children }: PropsWithChildren) {
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
  })

  return children
}

export default App
