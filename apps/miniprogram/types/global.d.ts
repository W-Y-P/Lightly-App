/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

interface WxCloud {
  init(options?: { env?: string | { value?: string }; traceUser?: boolean }): void
  callFunction(options: { name: string; data?: Record<string, any>; success?: (res: any) => void; fail?: (err: any) => void; complete?: (res: any) => void }): Promise<any> & { then: any }
}

interface Wx {
  cloud?: WxCloud
  [key: string]: any
}

declare const wx: Wx

declare namespace NodeJS {
  interface ProcessEnv {
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'quickapp' | 'qq' | 'jd';
  }
}
