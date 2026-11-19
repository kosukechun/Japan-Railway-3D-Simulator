import { cp, mkdir } from 'node:fs/promises'
const dest = 'public/cesium'
await mkdir(dest, { recursive: true })
for (const item of ['Assets', 'ThirdParty', 'Workers', 'Widgets', 'index.js']) {
  await cp('node_modules/cesium/Build/Cesium/' + item, dest + '/' + item, { recursive: true })
}
await cp('node_modules/cesium/LICENSE.md', dest + '/LICENSE.md')
await cp('node_modules/cesium/ThirdParty.json', dest + '/ThirdParty.json')
await cp('node_modules/cesium/ThirdParty.extra.json', dest + '/ThirdParty.extra.json')
