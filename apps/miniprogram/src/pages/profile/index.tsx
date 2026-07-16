import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { getEntitlement, deleteAccount, ensureAuthReady, getAuthMode, resetAuth } from '../../api/client'
import { resetTodayData } from '../../store/todayDataStore'
import './index.scss'

interface EntitlementState {
  pointBalance: number
  photoQuota: { freeRemaining: number; freeUsed: number; totalToday: number }
}

type IdentityState = 'loading' | 'wechat' | 'guest'

function accountErrorMessage(error?: string, partial = false) {
  if (partial) return '部分数据已删除，但仍有内容未清理完成。请再次点击“永久删除”继续处理。'
  if (!error) return '账号删除未完成，请稍后再次尝试。'
  if (/network|timeout|cloud_call_failed/i.test(error)) return '网络连接中断，删除结果暂未确认。请重新进入本页后再次尝试。'
  if (/auth|token|unauthorized|401/i.test(error)) return '登录状态已失效，删除结果暂未确认。请重新进入小程序后再次尝试。'
  return '账号删除未完成，请稍后再次尝试。'
}

export default function ProfilePage() {
  const [entitlement, setEntitlement] = useState<EntitlementState | null>(null)
  const [identity, setIdentity] = useState<IdentityState>('loading')
  const [accountId, setAccountId] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useDidShow(() => {
    loadProfile()
  })

  async function loadProfile() {
    setLoadFailed(false)
    setEntitlement(null)
    setIdentity('loading')
    setAccountId('')
    const authed = await ensureAuthReady()

    if (!authed) {
      setLoadFailed(true)
      return
    }

    setIdentity(getAuthMode() === 'wechat' ? 'wechat' : 'guest')
    setAccountId(Taro.getStorageSync('userId') || '')

    const res = await getEntitlement()
    if (res.ok) {
      setEntitlement(res.data)
    } else {
      setLoadFailed(true)
    }
  }

  const showPointRules = () => {
    Taro.showModal({
      title: '积分与拍照额度',
      content: '每天有 1 次免费拍照识别。完成当日达标可获得 1 积分；免费次数用完后，1 积分可兑换 1 次额外拍照识别。文字录入和手动记录不消耗积分。',
      showCancel: false,
      confirmText: '知道了',
    })
  }

  const showPrivacy = () => {
    Taro.showModal({
      title: '隐私说明',
      content: '你的身体数据和饮食记录仅用于生成个人计划与趋势分析。我们不会提供数据导出，也不会将健康数据用于公开展示。删除账号后，相关数据将永久清除。',
      showCancel: false,
      confirmText: '知道了',
    })
  }

  const showFeedback = () => {
    Taro.showModal({
      title: '意见反馈筹备中',
      content: '反馈通道正在筹备，目前暂不能提交。开放后会在这里明确显示入口。',
      showCancel: false,
      confirmText: '知道了',
    })
  }

  const showAbout = () => {
    Taro.showModal({
      title: '关于减脂助手',
      content: '减脂助手 v0.1.0\n用于记录饮食、体重与活动，并根据你的目标提供日常参考。健康数据仅供自我管理，不替代医疗建议。',
      showCancel: false,
      confirmText: '知道了',
    })
  }

  const handleDeleteAccount = () => {
    if (deleting) return

    Taro.showModal({
      title: '永久删除账号？',
      content: '删除后，个人计划、饮食、体重、活动记录和积分都会被永久清除，且无法恢复。',
      confirmText: '永久删除',
      confirmColor: '#C54F3D',
      cancelText: '取消',
      success: async (modalRes) => {
        if (!modalRes.confirm) return

        setDeleting(true)
        Taro.showLoading({ title: '正在删除', mask: true })
        try {
          const res = await deleteAccount()
          Taro.hideLoading()
          if (!res.ok) {
            Taro.showModal({
              title: '删除失败',
              content: accountErrorMessage(res.error, Boolean(res.data?.partial)),
              showCancel: false,
              confirmText: '知道了',
            })
            return
          }

          resetAuth()
          resetTodayData()
          setEntitlement(null)
          setIdentity('loading')
          setAccountId('')
          Taro.showToast({ title: '账号已删除', icon: 'success', duration: 1200 })
          setTimeout(() => Taro.reLaunch({ url: '/pages/today/index' }), 1200)
        } catch {
          Taro.hideLoading()
          Taro.showModal({
            title: '删除失败',
            content: '网络连接中断，删除结果暂未确认。请重新进入本页后再次尝试。',
            showCancel: false,
            confirmText: '知道了',
          })
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  const identityTitle = identity === 'wechat' ? '微信身份' : identity === 'guest' ? '游客身份' : '正在确认身份'
  const identityDesc = identity === 'wechat'
    ? '已通过微信安全登录'
    : identity === 'guest'
      ? '当前记录保存在此游客账号下'
      : '正在读取账号状态'
  const shortId = accountId ? `账号 ${accountId.slice(-8)}` : '无需单独注册'

  return (
    <View className='profile-page'>
      <View className='profile-scroll'>
        <View className='profile-heading'>
          <Text className='profile-eyebrow'>个人中心</Text>
          <Text className='profile-title'>我的健康空间</Text>
        </View>

        <View className='profile-identity'>
          <View className='profile-avatar' aria-hidden>
            <Text className='profile-avatar-text'>轻</Text>
          </View>
          <View className='profile-user-info'>
            <View className='profile-identity-line'>
              <Text className='profile-username'>{identityTitle}</Text>
              <Text className={`profile-status profile-status--${identity}`}>{identity === 'wechat' ? '已登录' : identity === 'guest' ? '游客' : '确认中'}</Text>
            </View>
            <Text className='profile-user-desc'>{identityDesc}</Text>
            <Text className='profile-user-id'>{shortId}</Text>
          </View>
        </View>

        <View className='profile-section-heading'>
          <Text className='profile-section-title'>今日权益</Text>
          <Text className='profile-section-meta'>每日 0 点更新免费额度</Text>
        </View>

        <View className='profile-benefits'>
          <View className='profile-benefit profile-benefit--points'>
            <Text className='profile-benefit-label'>积分余额</Text>
            <Text className='profile-benefit-value'>{entitlement?.pointBalance ?? '--'}</Text>
            <Text className='profile-benefit-note'>1 积分兑换 1 次额外识别</Text>
          </View>
          <View className='profile-benefit'>
            <Text className='profile-benefit-label'>免费拍照剩余</Text>
            <View className='profile-benefit-number-row'>
              <Text className='profile-benefit-value'>{entitlement?.photoQuota.freeRemaining ?? '--'}</Text>
              <Text className='profile-benefit-unit'>次</Text>
            </View>
            <Text className='profile-benefit-note'>今日已识别 {entitlement?.photoQuota.totalToday ?? '--'} 次</Text>
          </View>
        </View>

        {loadFailed ? (
          <View className='profile-load-error'>
            <Text className='profile-load-error-text'>权益信息未能更新，请检查网络。</Text>
            <View className='profile-retry' onClick={loadProfile}><Text>重新加载</Text></View>
          </View>
        ) : null}

        <View className='profile-rule' onClick={showPointRules}>
          <View className='profile-rule-mark'><Text>i</Text></View>
          <View className='profile-rule-copy'>
            <Text className='profile-rule-title'>积分怎么获得和使用？</Text>
            <Text className='profile-rule-desc'>每日达标得 1 积分，免费次数用完后可兑换</Text>
          </View>
          <Text className='profile-menu-arrow'>›</Text>
        </View>

        <View className='profile-section-heading profile-section-heading--menu'>
          <Text className='profile-section-title'>设置与支持</Text>
        </View>

        <View className='profile-menu'>
          <View className='profile-menu-item' onClick={() => Taro.switchTab({ url: '/pages/plan/index' })}>
            <View className='profile-menu-copy'>
              <Text className='profile-menu-label'>目标管理</Text>
              <Text className='profile-menu-desc'>查看当前计划与营养目标</Text>
            </View>
            <Text className='profile-menu-arrow'>›</Text>
          </View>
          <View className='profile-menu-item' onClick={showPrivacy}>
            <View className='profile-menu-copy'>
              <Text className='profile-menu-label'>隐私与数据</Text>
              <Text className='profile-menu-desc'>了解健康数据如何被使用</Text>
            </View>
            <Text className='profile-menu-arrow'>›</Text>
          </View>
          <View className='profile-menu-item' onClick={showFeedback}>
            <View className='profile-menu-copy'>
              <View className='profile-menu-title-row'>
                <Text className='profile-menu-label'>意见反馈</Text>
                <Text className='profile-pending'>筹备中</Text>
              </View>
              <Text className='profile-menu-desc'>反馈通道开放后可在此提交</Text>
            </View>
            <Text className='profile-menu-arrow'>›</Text>
          </View>
          <View className='profile-menu-item' onClick={showAbout}>
            <View className='profile-menu-copy'>
              <Text className='profile-menu-label'>关于减脂助手</Text>
              <Text className='profile-menu-desc'>版本信息与健康提示</Text>
            </View>
            <Text className='profile-menu-arrow'>›</Text>
          </View>
        </View>

        <View className={`profile-delete ${deleting ? 'profile-delete--disabled' : ''}`} onClick={handleDeleteAccount}>
          <Text className='profile-delete-text'>{deleting ? '正在删除账号' : '删除账号与全部数据'}</Text>
        </View>

        <Text className='profile-version'>减脂助手 v0.1.0</Text>
        <View className='profile-bottom-spacer' />
      </View>
    </View>
  )
}
