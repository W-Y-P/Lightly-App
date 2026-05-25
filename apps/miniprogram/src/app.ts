import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { ensureAuthReady } from './api/client'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // Kick off auth eagerly (non-blocking for the shell render).
    // Pages await ensureAuthReady() individually to avoid race conditions.
    ensureAuthReady()
  })

  return children
}

export default App
