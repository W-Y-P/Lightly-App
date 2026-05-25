import { View, Text, ScrollView } from '@tarojs/components'
import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { getEntitlement, deleteAccount, ensureAuthReady, resetAuth } from '../../api/client'
import './index.scss'

interface EntitlementState {
  pointBalance: number
  photoQuota: { freeRemaining: number; freeUsed: number; totalToday: number }
}

export default function ProfilePage() {
  const [entitlement, setEntitlement] = useState<EntitlementState | null>(null)

  // useDidShow: re-fetch every time tab is shown
  useDidShow(() => {
    loadEntitlement()
  })

  async function loadEntitlement() {
    // Wait for auth to be ready before calling authenticated endpoint
    const authed = await ensureAuthReady()
    if (!authed) return

    const res = await getEntitlement()
    if (res.ok) {
      setEntitlement(res.data)
    }
  }

  const handleDeleteAccount = () => {
    Taro.showModal({
      title: '确认删除账号',
      content: '删除后所有数据将被永久清除，不可恢复。是否继续？',
      confirmText: '删除',
      confirmColor: '#E91E63',
      success: async (modalRes) => {
        if (modalRes.confirm) {
          const res = await deleteAccount()
          if (res.ok) {
            Taro.showToast({ title: '账号已删除', icon: 'success' })
            resetAuth()
            setTimeout(() => {
              Taro.reLaunch({ url: '/pages/today/index' })
            }, 1500)
          } else {
            Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
          }
        }
      },
    })
  }

  const handleMenu = (name: string) => {
    if (name === '隐私政策') {
      Taro.showToast({ title: '隐私政策页面开发中', icon: 'none' })
    } else if (name === '账号删除') {
      handleDeleteAccount()
    } else {
      Taro.showToast({ title: name, icon: 'none' })
    }
  }

  return (
    <View className='profile-page'>
      <ScrollView className='profile-scroll' scrollY enhanced showScrollbar={false}>
        {/* User card */}
        <View className='profile-user-card'>
          <View className='profile-avatar'>
            <Text className='profile-avatar-text'>😊</Text>
          </View>
          <View className='profile-user-info'>
            <Text className='profile-username'>减脂小伙伴</Text>
            <Text className='profile-user-id'>欢迎使用减脂助手</Text>
          </View>
        </View>

        {/* Entitlement stats */}
        <View className='profile-stats'>
          <View className='profile-stat'>
            <Text className='profile-stat-value'>{entitlement?.pointBalance ?? '--'}</Text>
            <Text className='profile-stat-label'>积分余额</Text>
          </View>
          <View className='profile-stat'>
            <Text className='profile-stat-value'>{entitlement?.photoQuota?.freeRemaining ?? '--'}</Text>
            <Text className='profile-stat-label'>今日免费拍照</Text>
          </View>
          <View className='profile-stat'>
            <Text className='profile-stat-value'>{entitlement?.photoQuota?.totalToday ?? '--'}</Text>
            <Text className='profile-stat-label'>今日已用</Text>
          </View>
        </View>

        {/* Menu list */}
        <View className='profile-menu'>
          {[
            { icon: '📊', label: '数据导出' },
            { icon: '🎯', label: '目标管理' },
            { icon: '🔒', label: '隐私政策' },
            { icon: '🗑️', label: '账号删除' },
            { icon: '💬', label: '意见反馈' },
            { icon: 'ℹ️', label: '关于我们' },
          ].map(item => (
            <View key={item.label} className='profile-menu-item' onClick={() => handleMenu(item.label)}>
              <Text className='profile-menu-icon'>{item.icon}</Text>
              <Text className='profile-menu-label'>{item.label}</Text>
              <Text className='profile-menu-arrow'>›</Text>
            </View>
          ))}
        </View>

        {/* Version */}
        <View className='profile-version'>
          <Text className='profile-version-text'>减脂助手 v0.1.0</Text>
        </View>

        <View className='profile-bottom-spacer' />
      </ScrollView>
    </View>
  )
}
