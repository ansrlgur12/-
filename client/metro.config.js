// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// three 0.18x의 CommonJS 진입점(three.cjs)은 불러오는 순간 process.emitWarning()을 호출한다.
// React Native에는 그 함수가 없어서 앱이 "undefined is not a function"으로 시작되지 않는다.
// R3F 네이티브가 require('three')를 쓰므로, 항상 ESM 빌드(three.module.js)로 연결한다.
const threeModule = path.join(path.dirname(require.resolve('three')), 'three.module.js')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeModule }
  }
  return context.resolveRequest(context, moduleName, platform)
}

// 서버의 OSM 원본과 지도 타일(파일 10만 개 이상)은 앱 번들과 상관없으니 감시하지 않는다.
// 감시하면 느려지고, Windows에서는 타일 폴더를 바꿔치기(rename)할 수 없게 된다.
const serverData = path.resolve(__dirname, '../server/data')
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${serverData.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/\\\\/g, '[\\\\/]')}[\\\\/].*`),
]

module.exports = config
