import { useEffect, useMemo, useState } from 'react'
import { Input, Picker, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  ensureAuthReady,
  getCurrentPlan,
  PlanRecord,
  updatePlanGoal,
  updatePlanMacros,
} from '../../api/client'
import './index.scss'

interface PlanView {
  currentWeight: number
  targetWeight: number
  weeklyLoss: number | null
  targetDate: string
  bmr: number
  tdee: number
  dailyDeficit: number
  recommendedIntake: number
  macros: {
    protein: { min: number; max: number }
    carb: { min: number; max: number }
    fat: { min: number; max: number }
  }
  activityLevel: number
  activityLabel: string
}

type ModalKind = 'goal' | 'macros' | null
type GoalMode = 'weekly' | 'date'
type LoadState = 'loading' | 'real' | 'empty' | 'failed'

interface GoalForm {
  targetWeight: string
  weeklyLoss: string
  targetDate: string
  mode: GoalMode
}

interface MacroForm {
  proteinMin: string
  proteinMax: string
  carbMin: string
  carbMax: string
  fatMin: string
  fatMax: string
}

function activityLabel(level: number): string {
  if (level < 1.3) return '久坐，日常活动较少'
  if (level < 1.4) return '少量走动，偶尔站立或做家务'
  if (level < 1.55) return '经常走动，日常站立时间较多'
  if (level < 1.7) return '日常活跃，包含轻体力活动'
  return '体力活动较多'
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function mapRecord(record: PlanRecord): PlanView {
  return {
    currentWeight: record.currentWeightKg,
    targetWeight: record.targetWeightKg,
    weeklyLoss: record.weeklyLossKg,
    targetDate: normalizeDate(record.targetDate),
    bmr: record.bmrKcal,
    tdee: record.tdeeKcal,
    dailyDeficit: record.dailyDeficitTargetKcal,
    recommendedIntake: record.recommendedIntakeKcal,
    macros: {
      protein: { min: record.proteinMinG, max: record.proteinMaxG },
      carb: { min: record.carbMinG, max: record.carbMaxG },
      fat: { min: record.fatMinG, max: record.fatMaxG },
    },
    activityLevel: record.activityLevel,
    activityLabel: activityLabel(record.activityLevel),
  }
}

function localDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function weeklyLossFromDate(currentWeight: number, targetWeight: number, targetDate: string): number {
  const end = new Date(`${targetDate}T00:00:00`).getTime()
  const days = Math.max(1, Math.ceil((end - Date.now()) / 86400000))
  return (currentWeight - targetWeight) / (days / 7)
}

function setPlanTabBarVisible(visible: boolean) {
  const action = visible ? Taro.showTabBar : Taro.hideTabBar
  void action({ animation: false }).catch(() => {})
}

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanView | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [modal, setModal] = useState<ModalKind>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [goalForm, setGoalForm] = useState<GoalForm>({
    targetWeight: '', weeklyLoss: '', targetDate: '', mode: 'weekly',
  })
  const [macroForm, setMacroForm] = useState<MacroForm>({
    proteinMin: '', proteinMax: '', carbMin: '', carbMax: '', fatMin: '', fatMax: '',
  })

  useDidShow(() => {
    setReloadKey((key) => key + 1)
  })

  useEffect(() => () => setPlanTabBarVisible(true), [])

  useEffect(() => {
    let active = true
    setPlan(null)
    setLoadState('loading')
    ;(async () => {
      try {
        const authed = await ensureAuthReady()
        if (!authed) throw new Error('auth_unavailable')
        const result = await getCurrentPlan()
        if (!active) return
        if (result.ok && result.data.plan) {
          setPlan(mapRecord(result.data.plan))
          setLoadState('real')
        } else if (result.ok || result.error === 'no_active_plan') {
          setPlan(null)
          setLoadState('empty')
        } else {
          setPlan(null)
          setLoadState('failed')
        }
      } catch {
        if (!active) return
        setPlan(null)
        setLoadState('failed')
      }
    })()
    return () => { active = false }
  }, [reloadKey])

  const tomorrow = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return localDate(date)
  }, [])

  const goOnboarding = () => Taro.navigateTo({ url: '/pages/onboarding/index' })

  if (loadState === 'loading') {
    return (
      <View className='plan-page plan-page--loading'>
        <View className='plan-loading-mark' />
        <Text className='plan-loading-text'>正在读取个人计划</Text>
      </View>
    )
  }

  if (loadState === 'empty') {
    return (
      <View className='plan-page plan-page--state'>
        <View className='plan-state-card'>
          <View className='plan-state-mark'><Text>＋</Text></View>
          <Text className='plan-state-title'>还没有个人计划</Text>
          <Text className='plan-state-text'>完成基础信息与目标设置后，这里会显示你的每日计划。</Text>
          <View className='plan-state-action' onClick={goOnboarding}><Text>创建个人计划</Text></View>
        </View>
      </View>
    )
  }

  if (loadState === 'failed' || !plan) {
    return (
      <View className='plan-page plan-page--state'>
        <View className='plan-state-card'>
          <View className='plan-state-mark plan-state-mark--muted'><Text>i</Text></View>
          <Text className='plan-state-title'>个人计划读取失败</Text>
          <Text className='plan-state-text'>当前未展示任何替代计划，请检查网络后重试。</Text>
          <View className='plan-state-action' onClick={() => setReloadKey((key) => key + 1)}><Text>重新加载</Text></View>
        </View>
      </View>
    )
  }

  const remainingWeight = Math.max(0, plan.currentWeight - plan.targetWeight)
  const activityProgress = Math.max(0, Math.min(100, ((plan.activityLevel - 1.2) / 0.7) * 100))

  const openGoalModal = () => {
    setPlanTabBarVisible(false)
    setGoalForm({
      targetWeight: String(plan.targetWeight),
      weeklyLoss: plan.weeklyLoss == null ? '' : String(plan.weeklyLoss),
      targetDate: plan.targetDate,
      mode: plan.targetDate ? 'date' : 'weekly',
    })
    setFormError('')
    setModal('goal')
  }

  const openMacroModal = () => {
    setPlanTabBarVisible(false)
    setMacroForm({
      proteinMin: String(plan.macros.protein.min),
      proteinMax: String(plan.macros.protein.max),
      carbMin: String(plan.macros.carb.min),
      carbMax: String(plan.macros.carb.max),
      fatMin: String(plan.macros.fat.min),
      fatMax: String(plan.macros.fat.max),
    })
    setFormError('')
    setModal('macros')
  }

  const closeModal = () => {
    if (saving) return
    setPlanTabBarVisible(true)
    setModal(null)
    setFormError('')
  }

  const saveGoal = async () => {
    const targetWeight = Number(goalForm.targetWeight)
    if (!Number.isFinite(targetWeight) || targetWeight < 20 || targetWeight > 250) {
      setFormError('请输入 20-250 kg 之间的目标体重')
      return
    }
    if (targetWeight >= plan.currentWeight) {
      setFormError('减脂目标需低于当前体重')
      return
    }

    if (goalForm.mode === 'weekly') {
      const weeklyLoss = Number(goalForm.weeklyLoss)
      if (!Number.isFinite(weeklyLoss) || weeklyLoss < 0.1 || weeklyLoss > 2) {
        setFormError('每周减重请填写 0.1-2 kg')
        return
      }
    } else {
      const targetDate = goalForm.targetDate
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || targetDate < tomorrow) {
        setFormError('请选择今天之后的目标日期')
        return
      }
      const weeklyLoss = weeklyLossFromDate(plan.currentWeight, targetWeight, targetDate)
      if (weeklyLoss < 0.1 || weeklyLoss > 2) {
        setFormError('这个日期对应的节奏需在每周 0.1-2 kg 之间')
        return
      }
    }

    setSaving(true)
    setFormError('')
    try {
      const pace = goalForm.mode === 'weekly'
        ? { mode: 'weekly' as const, weeklyLossKg: Number(Number(goalForm.weeklyLoss).toFixed(2)) }
        : { mode: 'date' as const, targetDate: goalForm.targetDate }
      const result = await updatePlanGoal({
        targetWeightKg: Number(targetWeight.toFixed(1)),
        ...pace,
      })
      if (!result.ok) {
        setFormError('保存失败，请检查网络后重试')
        return
      }
      setPlan(mapRecord(result.data.plan))
      setPlanTabBarVisible(true)
      setModal(null)
      Taro.showToast({ title: '目标已更新', icon: 'success' })
    } catch {
      setFormError('保存失败，请检查网络后重试')
    } finally {
      setSaving(false)
    }
  }

  const saveMacros = async () => {
    const values = {
      proteinMinG: Number(macroForm.proteinMin),
      proteinMaxG: Number(macroForm.proteinMax),
      carbMinG: Number(macroForm.carbMin),
      carbMaxG: Number(macroForm.carbMax),
      fatMinG: Number(macroForm.fatMin),
      fatMaxG: Number(macroForm.fatMax),
    }
    if (Object.values(values).some((value) => !Number.isInteger(value) || value < 1 || value > 600)) {
      setFormError('请填写 1-600 之间的整数克数')
      return
    }
    if (values.proteinMinG > values.proteinMaxG || values.carbMinG > values.carbMaxG || values.fatMinG > values.fatMaxG) {
      setFormError('每项的下限不能高于上限')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const result = await updatePlanMacros(values)
      if (!result.ok) {
        setFormError('保存失败，请检查网络后重试')
        return
      }
      setPlan(mapRecord(result.data.plan))
      setPlanTabBarVisible(true)
      setModal(null)
      Taro.showToast({ title: '营养目标已更新', icon: 'success' })
    } catch {
      setFormError('保存失败，请检查网络后重试')
    } finally {
      setSaving(false)
    }
  }

  const energyRows = [
    { label: '每日总消耗', value: plan.tdee, suffix: 'kcal' },
    { label: '目标缺口', value: -plan.dailyDeficit, suffix: 'kcal' },
    { label: '建议摄入', value: plan.recommendedIntake, suffix: 'kcal', emphasized: true },
  ]
  const macroRows = [
    { key: 'protein', name: '蛋白质', note: '帮助维持肌肉', range: plan.macros.protein },
    { key: 'carb', name: '碳水', note: '支持日常活动', range: plan.macros.carb },
    { key: 'fat', name: '脂肪', note: '维持基础需要', range: plan.macros.fat },
  ]

  return (
    <View className='plan-page'>
      <View className='plan-goal-card'>
        <View className='plan-section-header'>
          <View>
            <Text className='plan-section-title'>我的目标</Text>
            <Text className='plan-section-caption'>按自己的节奏，稳稳向前</Text>
          </View>
          <View className='plan-text-action' onClick={openGoalModal}>
            <Text>调整</Text>
          </View>
        </View>
        <View className='plan-weight-route'>
          <View className='plan-weight-node'>
            <Text className='plan-weight-value'>{plan.currentWeight.toFixed(1)}</Text>
            <Text className='plan-weight-unit'>kg</Text>
            <Text className='plan-weight-label'>当前体重</Text>
          </View>
          <View className='plan-route-line'>
            <View className='plan-route-dot' />
            <View className='plan-route-track' />
            <View className='plan-route-dot plan-route-dot--target' />
          </View>
          <View className='plan-weight-node plan-weight-node--target'>
            <Text className='plan-weight-value'>{plan.targetWeight.toFixed(1)}</Text>
            <Text className='plan-weight-unit'>kg</Text>
            <Text className='plan-weight-label'>目标体重</Text>
          </View>
        </View>
        <View className='plan-goal-meta'>
          <View><Text className='plan-meta-label'>计划节奏</Text><Text className='plan-meta-value'>{plan.targetDate ? '按目标日期' : plan.weeklyLoss == null ? '暂未设置' : `每周约 ${plan.weeklyLoss.toFixed(1)} kg`}</Text></View>
          <View><Text className='plan-meta-label'>目标日期</Text><Text className='plan-meta-value'>{plan.targetDate || '不设固定日期'}</Text></View>
          <View><Text className='plan-meta-label'>距离目标</Text><Text className='plan-meta-value'>{remainingWeight.toFixed(1)} kg</Text></View>
        </View>
      </View>

      <View className='plan-card'>
        <View className='plan-section-header plan-section-header--compact'>
          <View><Text className='plan-section-title'>每日能量</Text><Text className='plan-section-caption'>根据当前体重与活动水平估算</Text></View>
        </View>
        <View className='plan-energy-equation'>
          {energyRows.map((row, index) => (
            <View key={row.label} className='plan-energy-step'>
              {index > 0 && <Text className='plan-energy-symbol'>{index === 1 ? '−' : '='}</Text>}
              <View className={`plan-energy-value-wrap ${row.emphasized ? 'plan-energy-value-wrap--emphasized' : ''}`}>
                <Text className='plan-energy-value'>{Math.abs(row.value)}</Text>
                <Text className='plan-energy-unit'>{row.suffix}</Text>
                <Text className='plan-energy-label'>{row.label}</Text>
              </View>
            </View>
          ))}
        </View>
        <View className='plan-bmr-row'><Text>基础代谢参考</Text><Text>{plan.bmr} kcal / 天</Text></View>
      </View>

      <View className='plan-card'>
        <View className='plan-section-header'>
          <View><Text className='plan-section-title'>碳蛋脂辅助目标</Text><Text className='plan-section-caption'>用于记录时参考，不需要每餐都完全一致</Text></View>
          <View className='plan-text-action' onClick={openMacroModal}><Text>调整</Text></View>
        </View>
        <View className='plan-macro-list'>
          {macroRows.map((row) => (
            <View key={row.key} className='plan-macro-row'>
              <View className={`plan-macro-mark plan-macro-mark--${row.key}`} />
              <View className='plan-macro-copy'><Text className='plan-macro-name'>{row.name}</Text><Text className='plan-macro-note'>{row.note}</Text></View>
              <Text className='plan-macro-range'>{row.range.min}-{row.range.max} g</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='plan-card'>
        <View className='plan-section-header plan-section-header--compact'>
          <View><Text className='plan-section-title'>活动水平</Text><Text className='plan-section-caption'>{plan.activityLabel}</Text></View>
        </View>
        <View className='plan-activity-scale'>
          <View className='plan-activity-track'><View className='plan-activity-fill' style={{ width: `${activityProgress}%` }} /><View className='plan-activity-marker' style={{ left: `${activityProgress}%` }} /></View>
          <View className='plan-activity-labels'><Text>较少</Text><Text>适中</Text><Text>较多</Text></View>
        </View>
      </View>

      <View className='plan-note'>
        <View className='plan-note-mark'><Text>i</Text></View>
        <Text className='plan-note-text'>计划是日常参考，不是硬性考核。体重和状态有波动时，优先照顾睡眠、恢复与稳定记录。</Text>
      </View>
      <View className='plan-bottom-spacer' />

      {modal === 'goal' && (
        <View className='plan-modal-mask' catchMove onClick={closeModal}>
          <View className='plan-modal' onClick={(event) => event.stopPropagation()}>
            <View className='plan-modal-header'><Text className='plan-modal-title'>调整目标</Text><View className={`plan-modal-close ${saving ? 'plan-modal-close--disabled' : ''}`} onClick={saving ? undefined : closeModal}><Text>×</Text></View></View>
            <View className='plan-form'>
              <View className='plan-field'>
                <Text className='plan-field-label'>目标体重</Text>
                <View className='plan-input-wrap'><Input className='plan-input' type='digit' value={goalForm.targetWeight} disabled={saving} onInput={(event) => setGoalForm({ ...goalForm, targetWeight: event.detail.value })} /><Text>kg</Text></View>
              </View>
              <View className='plan-field'>
                <Text className='plan-field-label'>设定节奏</Text>
                <View className='plan-form-segment'>
                  <View className={goalForm.mode === 'weekly' ? 'plan-form-segment-item plan-form-segment-item--active' : 'plan-form-segment-item'} onClick={saving ? undefined : () => { setGoalForm({ ...goalForm, mode: 'weekly' }); setFormError('') }}><Text>按周减重</Text></View>
                  <View className={goalForm.mode === 'date' ? 'plan-form-segment-item plan-form-segment-item--active' : 'plan-form-segment-item'} onClick={saving ? undefined : () => { setGoalForm({ ...goalForm, mode: 'date' }); setFormError('') }}><Text>按目标日期</Text></View>
                </View>
              </View>
              {goalForm.mode === 'weekly' ? (
                <View className='plan-field'><Text className='plan-field-label'>每周减重</Text><View className='plan-input-wrap'><Input className='plan-input' type='digit' value={goalForm.weeklyLoss} disabled={saving} onInput={(event) => setGoalForm({ ...goalForm, weeklyLoss: event.detail.value })} /><Text>kg</Text></View><Text className='plan-field-help'>可填写 0.1-2 kg</Text></View>
              ) : (
                <View className='plan-field'><Text className='plan-field-label'>目标日期</Text><Picker mode='date' value={goalForm.targetDate} start={tomorrow} end='2099-12-31' disabled={saving} onChange={(event) => setGoalForm({ ...goalForm, targetDate: event.detail.value })}><View className='plan-date-picker'><Text>{goalForm.targetDate || '选择日期'}</Text><Text className='plan-date-arrow'>›</Text></View></Picker></View>
              )}
              {formError && <Text className='plan-form-error'>{formError}</Text>}
            </View>
            <View className='plan-modal-footer'><View className={`plan-modal-button plan-modal-button--secondary ${saving ? 'plan-modal-button--disabled' : ''}`} onClick={closeModal}><Text>取消</Text></View><View className={`plan-modal-button plan-modal-button--primary ${saving ? 'plan-modal-button--disabled' : ''}`} onClick={saving ? undefined : saveGoal}><Text>{saving ? '保存中…' : '保存'}</Text></View></View>
          </View>
        </View>
      )}

      {modal === 'macros' && (
        <View className='plan-modal-mask' catchMove onClick={closeModal}>
          <View className='plan-modal' onClick={(event) => event.stopPropagation()}>
            <View className='plan-modal-header'><Text className='plan-modal-title'>调整碳蛋脂目标</Text><View className={`plan-modal-close ${saving ? 'plan-modal-close--disabled' : ''}`} onClick={saving ? undefined : closeModal}><Text>×</Text></View></View>
            <View className='plan-form'>
              {[
                { name: '蛋白质', minKey: 'proteinMin', maxKey: 'proteinMax' },
                { name: '碳水', minKey: 'carbMin', maxKey: 'carbMax' },
                { name: '脂肪', minKey: 'fatMin', maxKey: 'fatMax' },
              ].map((row) => (
                <View key={row.name} className='plan-macro-field'>
                  <Text className='plan-field-label'>{row.name}</Text>
                  <View className='plan-range-inputs'>
                    <View className='plan-input-wrap'><Input className='plan-input' type='number' value={macroForm[row.minKey]} disabled={saving} onInput={(event) => setMacroForm({ ...macroForm, [row.minKey]: event.detail.value })} /><Text>g</Text></View>
                    <Text className='plan-range-separator'>至</Text>
                    <View className='plan-input-wrap'><Input className='plan-input' type='number' value={macroForm[row.maxKey]} disabled={saving} onInput={(event) => setMacroForm({ ...macroForm, [row.maxKey]: event.detail.value })} /><Text>g</Text></View>
                  </View>
                </View>
              ))}
              <Text className='plan-field-help'>填写每天的参考下限与上限</Text>
              {formError && <Text className='plan-form-error'>{formError}</Text>}
            </View>
            <View className='plan-modal-footer'><View className={`plan-modal-button plan-modal-button--secondary ${saving ? 'plan-modal-button--disabled' : ''}`} onClick={closeModal}><Text>取消</Text></View><View className={`plan-modal-button plan-modal-button--primary ${saving ? 'plan-modal-button--disabled' : ''}`} onClick={saving ? undefined : saveMacros}><Text>{saving ? '保存中…' : '保存'}</Text></View></View>
          </View>
        </View>
      )}
    </View>
  )
}
