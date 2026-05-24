import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Crown,
  Camera,
  Heart,
  Settings,
  Shield,
  Trash2,
  ChevronRight,
  Info,
} from 'lucide-react-native';
import { useApp } from '../state/AppStateProvider';
import * as api from '../api/client';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { tier, userId, isUsingMockData, logout } = useApp();
  const [subscription, setSubscription] = useState<api.SubscriptionResponse | null>(null);

  useEffect(() => {
    if (!isUsingMockData && api.getToken()) {
      api.getSubscription().then((res) => {
        if (res.ok) setSubscription(res.data);
      });
    }
  }, [isUsingMockData]);

  const currentTier = subscription?.tier ?? tier;
  const photoLimit = subscription?.limits.photoEstimatesPerDay ?? (currentTier === 'vip' ? 10 : 2);
  const isVip = currentTier === 'vip';

  const handleDeleteAccount = () => {
    Alert.alert(
      '删除账号',
      '此操作不可恢复，所有数据将被永久删除。确定继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: async () => {
            if (isUsingMockData) {
              Alert.alert('提示', '演示模式下无法删除，请先连接服务器');
              return;
            }
            const res = await api.deleteAccount();
            if (res.ok) {
              Alert.alert('已删除', res.data.message, [
                { text: '好的', onPress: () => logout() },
              ]);
            } else {
              Alert.alert('删除失败', res.error);
            }
          },
        },
      ],
    );
  };

  const handleSubscribe = () => {
    Alert.alert(
      '订阅 VIP',
      '月订阅 ¥6/月\n\n• 拍照识别 10 次/月\n• 无限文字识别\n• 优先客服支持',
      [
        { text: '了解', style: 'cancel' },
        { text: '订阅', onPress: () => Alert.alert('提示', '支付功能即将上线') },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>我的</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── User card ───────────────────────────────────────── */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <User size={32} color="#fff" />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {isUsingMockData ? '演示用户' : `用户 ${userId?.slice(0, 8) ?? '---'}`}
            </Text>
            <View style={[styles.tierBadge, isVip && styles.tierBadgeVip]}>
              <Crown size={12} color={isVip ? '#FF9800' : '#999'} />
              <Text style={[styles.tierText, isVip && styles.tierTextVip]}>
                {isVip ? 'VIP' : '免费版'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Subscription ────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>订阅状态</Text>
          <View style={styles.subRow}>
            <View style={styles.subInfo}>
              <Text style={styles.subTier}>{isVip ? 'VIP 会员' : '免费版'}</Text>
              <Text style={styles.subDesc}>
                {isVip
                  ? '拍照 10 次/月 · 无限文字识别'
                  : '拍照 2 次/天 · 无限文字识别'}
              </Text>
            </View>
            {!isVip && (
              <TouchableOpacity style={styles.subBtn} onPress={handleSubscribe} activeOpacity={0.7}>
                <Text style={styles.subBtnText}>升级 ¥6/月</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Photo quota ─────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.quotaRow}>
            <Camera size={20} color="#2196F3" />
            <Text style={styles.quotaLabel}>今日拍照识别额度</Text>
            <Text style={styles.quotaValue}>
              {photoLimit === Infinity ? '无限' : `${photoLimit} 次`}
            </Text>
          </View>
          <Text style={styles.quotaHint}>
            {isVip ? 'VIP 每月 10 次拍照识别' : '免费用户每天 2 次拍照识别，升级 VIP 解锁更多'}
          </Text>
        </View>

        {/* ── HealthKit placeholder ───────────────────────────── */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
            <Heart size={20} color="#F44336" />
            <Text style={styles.menuLabel}>HealthKit 同步</Text>
            <Text style={styles.menuBadge}>即将推出</Text>
            <ChevronRight size={16} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* ── Settings section ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>设置</Text>

          <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
            <Settings size={20} color="#666" />
            <Text style={styles.menuLabel}>高级设置</Text>
            <ChevronRight size={16} color="#ccc" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
            <Shield size={20} color="#666" />
            <Text style={styles.menuLabel}>隐私协议</Text>
            <ChevronRight size={16} color="#ccc" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
            <Info size={20} color="#666" />
            <Text style={styles.menuLabel}>关于我们</Text>
            <Text style={styles.menuValue}>v0.1.0</Text>
            <ChevronRight size={16} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* ── Delete account ──────────────────────────────────── */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Trash2 size={18} color="#F44336" />
          <Text style={styles.deleteText}>删除账号及所有数据</Text>
        </TouchableOpacity>

        {isUsingMockData && (
          <Text style={styles.mockNote}>当前为本地演示模式，部分功能不可用</Text>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FDF8',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  tierBadgeVip: {
    backgroundColor: '#FFF3E0',
  },
  tierText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  tierTextVip: {
    color: '#FF9800',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subInfo: {
    flex: 1,
  },
  subTier: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  subDesc: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  subBtn: {
    backgroundColor: '#FF9800',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  subBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quotaLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  quotaValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  quotaHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    paddingLeft: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  menuValue: {
    fontSize: 13,
    color: '#999',
    marginRight: 4,
  },
  menuBadge: {
    fontSize: 11,
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F0F0F0',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
  },
  deleteText: {
    fontSize: 14,
    color: '#F44336',
    fontWeight: '500',
  },
  mockNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
});
