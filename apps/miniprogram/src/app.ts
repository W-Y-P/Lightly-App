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

    // Kick off auth eagerly (non-blocking for the shell render).
    // Pages await ensureAuthReady() individually to avoid race conditions.
    ensureAuthReady()
  })

  return children
}

export default App
