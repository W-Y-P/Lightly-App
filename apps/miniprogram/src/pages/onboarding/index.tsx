import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { createPlan, ensureAuthReady } from '../../api/client'
import './index.scss'

const TOTAL_STEPS = 5

const ACTIVITY_LEVELS = [
  { value: 1.2, label: '久坐', desc: '几乎不运动，办公室工作' },
  { value: 1.4, label: '轻度活跃', desc: '每周运动 1-3 次' },
  { value: 1.6, label: '中度活跃', desc: '每周运动 3-5 次' },
  { value: 1.8, label: '活跃', desc: '每周运动 6-7 次' },
  { value: 2.0, label: '非常活跃', desc: '体力劳动或高强度训练' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [currentWeight, setCurrentWeight] = useState('')
  const [targetWeight, setTargetWeight] = useState('')
  const [weeklyLoss, setWeeklyLoss] = useState('0.5')
  const [activity, setActivity] = useState(1.4)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canNext = () => {
    switch (step) {
      case 0: return true
      case 1: return sex && age && parseInt(age) > 0
      case 2: return height && currentWeight && targetWeight
      case 3: return !!weeklyLoss
      case 4: return !!activity
      default: return false
    }
  }

  const handleNext = () => {
    if (!canNext()) return
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSkip = () => {
    console.log('onboarding skip')
    Taro.switchTab({ url: '/pages/today/index' })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      // Ensure auth token is ready before creating plan
      const authed = await ensureAuthReady()
      if (!authed) {
        setError('登录失败，请稍后重试')
        Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
        return
      }

      const res = await createPlan({
        sex,
        age: parseInt(age),
        heightCm: parseFloat(height),
        currentWeightKg: parseFloat(currentWeight),
        targetWeightKg: parseFloat(targetWeight),
        weeklyLossKg: parseFloat(weeklyLoss),
        activityMultiplier: activity,
      })

      if (res.ok) {
        Taro.showToast({ title: '计划创建成功！', icon: 'success', duration: 1500 })
        setTimeout(() => {
          Taro.switchTab({ url: '/pages/today/index' })
        }, 1500)
      } else {
        setError(res.error || '创建失败，请检查信息后重试')
        Taro.showToast({ title: '创建失败，请检查信息', icon: 'none' })
      }
    } catch (err) {
      setError('网络异常，请稍后重试')
      Taro.showToast({ title: '网络异常', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View className='onboard-step'>
            <Text className='onboard-emoji'>🥗</Text>
            <Text className='onboard-step-title'>欢迎使用减脂助手</Text>
            <Text className='onboard-step-desc'>
              科学管理饮食和运动，轻松达成减脂目标。我们会根据你的情况制定专属计划。
            </Text>
            <View className='onboard-features'>
              <Text className='onboard-feature'>📊 智能热量管理</Text>
              <Text className='onboard-feature'>🍽️ 便捷饮食记录</Text>
              <Text className='onboard-feature'>📈 趋势追踪分析</Text>
              <Text className='onboard-feature'>🎯 个性化计划</Text>
            </View>
          </View>
        )
      case 1:
        return (
          <View className='onboard-step'>
            <Text className='onboard-emoji'>👤</Text>
            <Text className='onboard-step-title'>基本信息</Text>
            <Text className='onboard-step-desc'>帮助我们更准确地计算你的需求</Text>
            <View className='onboard-field'>
              <Text className='onboard-label'>性别</Text>
              <View className='onboard-sex-row'>
                <View className={`onboard-sex-btn ${sex === 'male' ? 'onboard-sex-btn--active' : ''}`} onClick={() => setSex('male')}>
                  <Text className='onboard-sex-text'>♂ 男</Text>
                </View>
                <View className={`onboard-sex-btn ${sex === 'female' ? 'onboard-sex-btn--active' : ''}`} onClick={() => setSex('female')}>
                  <Text className='onboard-sex-text'>♀ 女</Text>
                </View>
              </View>
            </View>
            <View className='onboard-field'>
              <Text className='onboard-label'>年龄</Text>
              <Input className='onboard-input' type='number' placeholder='请输入年龄' value={age} onInput={e => setAge(e.detail.value)} />
            </View>
          </View>
        )
      case 2:
        return (
          <View className='onboard-step'>
            <Text className='onboard-emoji'>📏</Text>
            <Text className='onboard-step-title'>身体数据</Text>
            <Text className='onboard-step-desc'>这些数据将用于计算你的基础代谢和目标</Text>
            <View className='onboard-field'>
              <Text className='onboard-label'>身高 (cm)</Text>
              <Input className='onboard-input' type='digit' placeholder='请输入身高' value={height} onInput={e => setHeight(e.detail.value)} />
            </View>
            <View className='onboard-field'>
              <Text className='onboard-label'>当前体重 (kg)</Text>
              <Input className='onboard-input' type='digit' placeholder='请输入当前体重' value={currentWeight} onInput={e => setCurrentWeight(e.detail.value)} />
            </View>
            <View className='onboard-field'>
              <Text className='onboard-label'>目标体重 (kg)</Text>
              <Input className='onboard-input' type='digit' placeholder='请输入目标体重' value={targetWeight} onInput={e => setTargetWeight(e.detail.value)} />
            </View>
          </View>
        )
      case 3:
        return (
          <View className='onboard-step'>
            <Text className='onboard-emoji'>⚡</Text>
            <Text className='onboard-step-title'>减重速度</Text>
            <Text className='onboard-step-desc'>选择适合自己的节奏，循序渐进更健康</Text>
            <View className='onboard-weekly-row'>
              {['0.25', '0.5', '0.75', '1.0'].map(w => (
                <View key={w} className={`onboard-weekly-btn ${weeklyLoss === w ? 'onboard-weekly-btn--active' : ''}`} onClick={() => setWeeklyLoss(w)}>
                  <Text className='onboard-weekly-value'>{w}</Text>
                  <Text className='onboard-weekly-unit'>kg/周</Text>
                </View>
              ))}
            </View>
            <View className='onboard-note'>
              <Text className='onboard-note-text'>💡 建议每周减重 0.5 kg 左右，节奏温和且容易坚持</Text>
            </View>
          </View>
        )
      case 4:
        return (
          <View className='onboard-step'>
            <Text className='onboard-emoji'>🏃</Text>
            <Text className='onboard-step-title'>活动水平</Text>
            <Text className='onboard-step-desc'>选择最接近你日常的活动水平</Text>
            <View className='onboard-activity-list'>
              {ACTIVITY_LEVELS.map(a => (
                <View key={a.value} className={`onboard-activity-card ${activity === a.value ? 'onboard-activity-card--active' : ''}`} onClick={() => setActivity(a.value)}>
                  <Text className='onboard-activity-label'>{a.label}</Text>
                  <Text className='onboard-activity-desc'>{a.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      default:
        return null
    }
  }

  return (
    <View className='onboard-page'>
      {/* Progress dots */}
      <View className='onboard-progress'>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} className={`onboard-dot ${i === step ? 'onboard-dot--active' : ''} ${i < step ? 'onboard-dot--done' : ''}`} />
        ))}
      </View>

      <ScrollView className='onboard-scroll' scrollY enhanced showScrollbar={false}>
        {renderStep()}
        {error ? (
          <View className='onboard-error'>
            <Text className='onboard-error-text'>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom buttons */}
      <View className='onboard-bottom'>
        <View className='onboard-bottom-row'>
          {step > 0 ? (
            <View className='onboard-back-btn' onClick={handleBack}>
              <Text className='onboard-back-text'>← 上一步</Text>
            </View>
          ) : (
            <View className='onboard-back-btn' onClick={handleSkip}>
              <Text className='onboard-back-text'>跳过</Text>
            </View>
          )}
          <View className={`onboard-next-btn ${!canNext() ? 'onboard-next-btn--disabled' : ''}`} onClick={handleNext}>
            <Text className='onboard-next-text'>
              {submitting ? '创建中...' : step === TOTAL_STEPS - 1 ? '开始计划 →' : '下一步 →'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
