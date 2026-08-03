import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { createPlan, ensureAuthReady } from '../../api/client'
import './index.scss'

const TOTAL_STEPS = 4

const ACTIVITY_LEVELS = [
  { value: 1.2, label: '久坐为主', desc: '工作生活多为坐姿，日常走动很少' },
  { value: 1.3, label: '少量走动', desc: '日常偶尔步行、站立或做家务' },
  { value: 1.45, label: '经常走动', desc: '每天有较多步行或站立', recommended: true },
  { value: 1.6, label: '日常活跃', desc: '工作生活走动较多，含轻体力活动' },
  { value: 1.75, label: '体力活动多', desc: '日常以体力劳动或持续走动为主' },
]

const WEEKLY_LOSS_OPTIONS = [
  { value: '0.25', label: '0.25 kg', desc: '轻缓' },
  { value: '0.5', label: '0.5 kg', desc: '推荐' },
  { value: '0.75', label: '0.75 kg', desc: '较快' },
  { value: '1', label: '1.0 kg', desc: '快速' },
]

type PaceMode = 'weekly' | 'date'

interface OnboardingDraft {
  step?: number
  sex?: 'male' | 'female'
  age?: string
  height?: string
  currentWeight?: string
  targetWeight?: string
  paceMode?: PaceMode
  weeklyLoss?: string
  targetDate?: string
  activity?: number
}

const ONBOARDING_DRAFT_KEY = 'onboardingDraft'

function readDraft(): OnboardingDraft {
  try {
    const value = Taro.getStorageSync(ONBOARDING_DRAFT_KEY)
    return value && typeof value === 'object' ? value as OnboardingDraft : {}
  } catch {
    return {}
  }
}

function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateAfterWeeks(weeks: number) {
  const date = new Date()
  date.setDate(date.getDate() + weeks * 7)
  return toDateString(date)
}

function tomorrowString() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return toDateString(date)
}

function planErrorMessage(error?: string) {
  if (!error) return '计划创建失败，请检查填写内容后重试'
  if (/network|timeout|cloud_call_failed/i.test(error)) return '网络连接异常，计划尚未创建，请稍后重试'
  if (/auth|token|unauthorized|401/i.test(error)) return '登录状态已失效，请重新进入小程序后再创建计划'
  if (/goal_required|invalid_plan_input|invalid_input/i.test(error)) return '部分数据不符合计划要求，请返回检查后重试'
  return '服务暂时不可用，计划尚未创建，请稍后重试'
}

export default function OnboardingPage() {
  const [draft] = useState(readDraft)
  const [step, setStep] = useState(Math.max(0, Math.min(TOTAL_STEPS - 1, Number(draft.step) || 0)))
  const [sex, setSex] = useState<'male' | 'female'>(draft.sex === 'male' ? 'male' : 'female')
  const [age, setAge] = useState(draft.age || '')
  const [height, setHeight] = useState(draft.height || '')
  const [currentWeight, setCurrentWeight] = useState(draft.currentWeight || '')
  const [targetWeight, setTargetWeight] = useState(draft.targetWeight || '')
  const [paceMode, setPaceMode] = useState<PaceMode>(draft.paceMode === 'date' ? 'date' : 'weekly')
  const [weeklyLoss, setWeeklyLoss] = useState(draft.weeklyLoss || '0.5')
  const [targetDate, setTargetDate] = useState(draft.targetDate || dateAfterWeeks(12))
  const [activity, setActivity] = useState(ACTIVITY_LEVELS.some((item) => item.value === draft.activity) ? draft.activity as number : 1.45)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (completed) return
    Taro.setStorageSync(ONBOARDING_DRAFT_KEY, {
      step, sex, age, height, currentWeight, targetWeight, paceMode, weeklyLoss, targetDate, activity,
    })
  }, [activity, age, completed, currentWeight, height, paceMode, sex, step, targetDate, targetWeight, weeklyLoss])

  const updateField = (setter: (value: string) => void, value: string) => {
    setter(value)
    setError('')
  }

  const validateStep = (currentStep: number): string => {
    if (currentStep === 0) {
      const ageValue = Number(age)
      if (!age.trim()) return '请输入年龄'
      if (!Number.isInteger(ageValue) || ageValue < 6 || ageValue > 100) return '年龄需为 6-100 岁的整数'
    }

    if (currentStep === 1) {
      const heightValue = Number(height)
      const currentValue = Number(currentWeight)
      const targetValue = Number(targetWeight)
      if (!height.trim() || !currentWeight.trim() || !targetWeight.trim()) return '请完整填写身高、当前体重和目标体重'
      if (heightValue < 100 || heightValue > 230) return '身高需在 100-230 cm 之间'
      if (currentValue < 20 || currentValue > 250) return '当前体重需在 20-250 kg 之间'
      if (targetValue < 20 || targetValue > 250) return '目标体重需在 20-250 kg 之间'
      if (targetValue >= currentValue) return '减脂目标体重需要低于当前体重'
    }

    if (currentStep === 2) {
      if (paceMode === 'weekly') {
        const weeklyValue = Number(weeklyLoss)
        if (weeklyValue < 0.1 || weeklyValue > 2) return '每周减重速度需在 0.1-2 kg 之间'
      } else if (!targetDate || new Date(`${targetDate}T23:59:59`).getTime() <= Date.now()) {
        return '目标日期需要晚于今天'
      }
    }

    if (currentStep === 3 && !activity) return '请选择日常活动水平'
    return ''
  }

  const estimatedWeeklyLoss = () => {
    if (paceMode === 'weekly') return Number(weeklyLoss)
    const currentValue = Number(currentWeight)
    const targetValue = Number(targetWeight)
    const days = Math.max(1, Math.ceil((new Date(`${targetDate}T00:00:00`).getTime() - Date.now()) / 86400000))
    return ((currentValue - targetValue) / days) * 7
  }

  const showRiskConfirmation = (title: string, content: string) => new Promise<boolean>((resolve) => {
    Taro.showModal({
      title,
      content,
      cancelText: '返回调整',
      confirmText: '仍然继续',
      confirmColor: '#B06A28',
      success: result => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })

  const handleNext = async () => {
    if (submitting || completed) return

    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }

    if (step === 0 && Number(age) < 18) {
      const confirmed = await showRiskConfirmation(
        '未成年人健康提示',
        '未成年人仍处于生长发育阶段，建议与监护人、医生或营养专业人员一起制定计划。你可以继续，但请优先保证充足营养。',
      )
      if (!confirmed) return
    }

    if (step === 2) {
      const speed = estimatedWeeklyLoss()
      const bodyWeightRatio = speed / Number(currentWeight)
      if (speed > 0.75 || bodyWeightRatio > 0.01) {
        const confirmed = await showRiskConfirmation(
          '减重速度偏快',
          `按当前选择，预计每周减重约 ${speed.toFixed(2)} kg。较快速度可能增加疲劳与反弹风险，默认更建议每周 0.5 kg 左右。`,
        )
        if (!confirmed) return
      }
    }

    setError('')
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1)
      return
    }

    await handleSubmit()
  }

  const handleBack = () => {
    if (submitting) return
    setError('')
    if (step > 0) setStep(step - 1)
  }

  const handleExit = () => {
    Taro.showModal({
      title: '暂不创建计划？',
      content: '你可以先进入今日页，之后再从“我的 - 目标管理”回来设置。',
      cancelText: '继续设置',
      confirmText: '暂时跳过',
      success: result => {
        if (result.confirm) Taro.switchTab({ url: '/pages/today/index' })
      },
    })
  }

  const handleSubmit = async () => {
    for (let index = 0; index < TOTAL_STEPS; index += 1) {
      const validationError = validateStep(index)
      if (validationError) {
        setStep(index)
        setError(validationError)
        return
      }
    }

    setSubmitting(true)
    setError('')

    try {
      const authed = await ensureAuthReady()
      if (!authed) {
        setError('登录未完成，请检查网络后重新创建计划')
        return
      }

      const res = await createPlan({
        sex,
        age: Number(age),
        heightCm: Number(height),
        currentWeightKg: Number(currentWeight),
        targetWeightKg: Number(targetWeight),
        activityMultiplier: activity,
        ...(paceMode === 'weekly' ? { weeklyLossKg: Number(weeklyLoss) } : { targetDate }),
      })

      if (!res.ok) {
        setError(planErrorMessage(res.error))
        return
      }

      setCompleted(true)
      Taro.removeStorageSync(ONBOARDING_DRAFT_KEY)
      Taro.showToast({ title: '计划已创建', icon: 'success', duration: 1000 })
      setTimeout(() => Taro.switchTab({ url: '/pages/today/index' }), 1000)
    } catch {
      setError('网络连接异常，计划尚未创建，请稍后重试')
    } finally {
      if (!completed) setSubmitting(false)
    }
  }

  const selectPaceMode = (mode: PaceMode) => {
    setPaceMode(mode)
    setError('')
    if (mode === 'date' && currentWeight && targetWeight) {
      const weeks = Math.max(4, Math.ceil((Number(currentWeight) - Number(targetWeight)) / 0.5))
      setTargetDate(dateAfterWeeks(weeks))
    }
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View className='onboard-step'>
            <Text className='onboard-kicker'>先了解你</Text>
            <Text className='onboard-step-title'>建立合适的起点</Text>
            <Text className='onboard-step-desc'>年龄和生理性别用于估算基础代谢，只影响计划计算。</Text>

            <View className='onboard-field'>
              <Text className='onboard-label'>生理性别</Text>
              <View className='onboard-segmented'>
                <View className={`onboard-segment ${sex === 'female' ? 'onboard-segment--active' : ''}`} onClick={() => setSex('female')}>
                  <Text>女</Text>
                </View>
                <View className={`onboard-segment ${sex === 'male' ? 'onboard-segment--active' : ''}`} onClick={() => setSex('male')}>
                  <Text>男</Text>
                </View>
              </View>
            </View>

            <View className='onboard-field'>
              <View className='onboard-label-row'>
                <Text className='onboard-label'>年龄</Text>
                <Text className='onboard-label-hint'>6-100 岁</Text>
              </View>
              <View className='onboard-input-wrap'>
                <Input className='onboard-input' type='number' maxlength={3} placeholder='例如 28' value={age} onInput={event => updateField(setAge, event.detail.value)} />
                <Text className='onboard-input-unit'>岁</Text>
              </View>
            </View>

            <View className='onboard-guidance'>
              <View className='onboard-guidance-line' />
              <Text className='onboard-guidance-text'>未满 18 岁仍可继续，我们会先提示健康风险。</Text>
            </View>
          </View>
        )
      case 1:
        return (
          <View className='onboard-step'>
            <Text className='onboard-kicker'>身体与目标</Text>
            <Text className='onboard-step-title'>目标要具体，也要可达</Text>
            <Text className='onboard-step-desc'>请填写近期稳定数据，计划之后仍可调整。</Text>

            <View className='onboard-field'>
              <View className='onboard-label-row'>
                <Text className='onboard-label'>身高</Text>
                <Text className='onboard-label-hint'>100-230 cm</Text>
              </View>
              <View className='onboard-input-wrap'>
                <Input className='onboard-input' type='digit' maxlength={5} placeholder='例如 168' value={height} onInput={event => updateField(setHeight, event.detail.value)} />
                <Text className='onboard-input-unit'>cm</Text>
              </View>
            </View>

            <View className='onboard-paired-fields'>
              <View className='onboard-field onboard-field--half'>
                <Text className='onboard-label'>当前体重</Text>
                <View className='onboard-input-wrap'>
                  <Input className='onboard-input' type='digit' maxlength={6} placeholder='例如 72.5' value={currentWeight} onInput={event => updateField(setCurrentWeight, event.detail.value)} />
                  <Text className='onboard-input-unit'>kg</Text>
                </View>
              </View>
              <View className='onboard-field onboard-field--half'>
                <Text className='onboard-label'>目标体重</Text>
                <View className='onboard-input-wrap'>
                  <Input className='onboard-input' type='digit' maxlength={6} placeholder='例如 65' value={targetWeight} onInput={event => updateField(setTargetWeight, event.detail.value)} />
                  <Text className='onboard-input-unit'>kg</Text>
                </View>
              </View>
            </View>

            <View className='onboard-guidance'>
              <View className='onboard-guidance-line' />
              <Text className='onboard-guidance-text'>短期波动很正常，建议使用晨起、空腹时的体重。</Text>
            </View>
          </View>
        )
      case 2:
        return (
          <View className='onboard-step'>
            <Text className='onboard-kicker'>选择节奏</Text>
            <Text className='onboard-step-title'>怎样定义你的目标？</Text>
            <Text className='onboard-step-desc'>选择一种方式即可。默认推荐温和、容易坚持的速度。</Text>

            <View className='onboard-mode-tabs'>
              <View className={`onboard-mode-tab ${paceMode === 'weekly' ? 'onboard-mode-tab--active' : ''}`} onClick={() => selectPaceMode('weekly')}>
                <Text>按每周减重</Text>
              </View>
              <View className={`onboard-mode-tab ${paceMode === 'date' ? 'onboard-mode-tab--active' : ''}`} onClick={() => selectPaceMode('date')}>
                <Text>按目标日期</Text>
              </View>
            </View>

            {paceMode === 'weekly' ? (
              <View className='onboard-weekly-list'>
                {WEEKLY_LOSS_OPTIONS.map(option => (
                  <View key={option.value} className={`onboard-choice-row ${weeklyLoss === option.value ? 'onboard-choice-row--active' : ''}`} onClick={() => { setWeeklyLoss(option.value); setError('') }}>
                    <View className='onboard-radio'><View className='onboard-radio-dot' /></View>
                    <View className='onboard-choice-copy'>
                      <Text className='onboard-choice-title'>每周 {option.label}</Text>
                      <Text className='onboard-choice-desc'>{option.desc}</Text>
                    </View>
                    {option.value === '0.5' ? <Text className='onboard-recommended'>保守推荐</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <View className='onboard-date-section'>
                <Text className='onboard-label'>期望达到目标的日期</Text>
                <Picker mode='date' start={tomorrowString()} value={targetDate} onChange={event => updateField(setTargetDate, event.detail.value)}>
                  <View className='onboard-date-picker'>
                    <Text className='onboard-date-value'>{targetDate}</Text>
                    <Text className='onboard-date-action'>选择日期</Text>
                  </View>
                </Picker>
                <Text className='onboard-date-estimate'>按当前目标，预计每周减重 {estimatedWeeklyLoss().toFixed(2)} kg</Text>
              </View>
            )}

            <View className='onboard-caution'>
              <Text className='onboard-caution-title'>温和减重更容易长期维持</Text>
              <Text className='onboard-caution-desc'>速度过快时会先提示风险；你仍可确认并继续。</Text>
            </View>
          </View>
        )
      case 3:
        return (
          <View className='onboard-step'>
            <Text className='onboard-kicker'>最后一步</Text>
            <Text className='onboard-step-title'>你的日常活动水平</Text>
            <Text className='onboard-step-desc'>按大多数周的实际情况选择，不必把偶尔运动算得过高。</Text>

            <View className='onboard-activity-list'>
              {ACTIVITY_LEVELS.map(option => (
                <View key={option.value} className={`onboard-choice-row ${activity === option.value ? 'onboard-choice-row--active' : ''}`} onClick={() => { setActivity(option.value); setError('') }}>
                  <View className='onboard-radio'><View className='onboard-radio-dot' /></View>
                  <View className='onboard-choice-copy'>
                    <Text className='onboard-choice-title'>{option.label}</Text>
                    <Text className='onboard-choice-desc'>{option.desc}</Text>
                  </View>
                  {option.recommended ? <Text className='onboard-recommended'>默认</Text> : null}
                </View>
              ))}
            </View>

            <View className='onboard-summary'>
              <View className='onboard-summary-item'>
                <Text className='onboard-summary-label'>体重目标</Text>
                <Text className='onboard-summary-value'>{currentWeight || '--'} → {targetWeight || '--'} kg</Text>
              </View>
              <View className='onboard-summary-item'>
                <Text className='onboard-summary-label'>目标方式</Text>
                <Text className='onboard-summary-value'>{paceMode === 'weekly' ? `每周 ${weeklyLoss} kg` : targetDate}</Text>
              </View>
            </View>
          </View>
        )
      default:
        return null
    }
  }

  return (
    <View className='onboard-page'>
      <View className='onboard-header'>
        <View className='onboard-header-row'>
          <Text className='onboard-header-title'>建立减脂计划</Text>
          <Text className='onboard-step-count'>{step + 1} / {TOTAL_STEPS}</Text>
        </View>
        <View className='onboard-progress' aria-label={`第 ${step + 1} 步，共 ${TOTAL_STEPS} 步`}>
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <View key={index} className={`onboard-progress-item ${index <= step ? 'onboard-progress-item--active' : ''}`} />
          ))}
        </View>
      </View>

      <ScrollView className='onboard-scroll' scrollY enhanced showScrollbar={false}>
        {renderStep()}
        {error ? (
          <View className='onboard-error'>
            <Text className='onboard-error-mark'>!</Text>
            <Text className='onboard-error-text'>{error}</Text>
          </View>
        ) : null}
        <View className='onboard-scroll-spacer' />
      </ScrollView>

      <View className='onboard-bottom'>
        <View className='onboard-secondary-btn' onClick={step > 0 ? handleBack : handleExit}>
          <Text>{step > 0 ? '上一步' : '暂时跳过'}</Text>
        </View>
        <View className={`onboard-primary-btn ${submitting || completed ? 'onboard-primary-btn--disabled' : ''}`} onClick={handleNext}>
          <Text>{completed ? '创建成功' : submitting ? '正在创建…' : step === TOTAL_STEPS - 1 ? '创建我的计划' : '继续'}</Text>
        </View>
      </View>
    </View>
  )
}
