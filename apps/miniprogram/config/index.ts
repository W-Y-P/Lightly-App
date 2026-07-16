import { defineConfig } from '@tarojs/cli'
import path from 'path'

export default defineConfig({
  projectName: 'fat-loss-miniprogram',
  date: '2026-05-26',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [
    '@tarojs/plugin-framework-react',
    '@tarojs/plugin-platform-weapp',
    '@tarojs/plugin-platform-h5',
  ],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    // Keep dependency resolution in webpack so universal-router uses its v6 matcher.
    prebundle: { enable: false },
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    esnextModules: [],
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
    devServer: {
      port: 10086,
      host: '0.0.0.0',
    },
    webpackChain(chain) {
      chain.resolve.modules.add(path.resolve(process.cwd(), 'node_modules'))
      chain.resolve.modules.add(path.resolve(process.cwd(), '../../node_modules'))
      // universal-router requires path-to-regexp v6, while Express hoists v0.1 at the repo root.
      chain.resolve.alias.set(
        'path-to-regexp',
        path.resolve(process.cwd(), '../../node_modules/universal-router/node_modules/path-to-regexp'),
      )
    },
  },
})
