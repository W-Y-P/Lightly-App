export default defineAppConfig({
  pages: [
    'pages/today/index',
    'pages/record/index',
    'pages/trend/index',
    'pages/plan/index',
    'pages/profile/index',
    'pages/onboarding/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#E8F5E9',
    navigationBarTitleText: '减脂助手',
    navigationBarTextStyle: 'black',
    backgroundColor: '#E8F5E9',
  },
  tabBar: {
    color: '#9AA0A6',
    selectedColor: '#21B96B',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/today/index',
        text: '今日',
        iconPath: 'assets/tab-home.png',
        selectedIconPath: 'assets/tab-home-active.png',
      },
      {
        pagePath: 'pages/record/index',
        text: '记录',
        iconPath: 'assets/tab-record.png',
        selectedIconPath: 'assets/tab-record-active.png',
      },
      {
        pagePath: 'pages/trend/index',
        text: '趋势',
        iconPath: 'assets/tab-trend.png',
        selectedIconPath: 'assets/tab-trend-active.png',
      },
      {
        pagePath: 'pages/plan/index',
        text: '计划',
        iconPath: 'assets/tab-plan.png',
        selectedIconPath: 'assets/tab-plan-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tab-user.png',
        selectedIconPath: 'assets/tab-user-active.png',
      },
    ],
  },
})
