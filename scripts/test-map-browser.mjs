// Run against an active npm run dev. Browser output and screenshots stay under test-results/.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const url=process.env.RAIL_TEST_URL??'http://127.0.0.1:5173'
const browser=await chromium.launch({channel:process.env.RAIL_BROWSER_CHANNEL??(process.platform==='win32'?'msedge':undefined),
  headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
await fs.mkdir('test-results',{recursive:true})
const errors=[]
try{
  const page=await browser.newPage({viewport:{width:1440,height:980},deviceScaleFactor:1})
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::'))console.log(m.text().slice(0,1100))})
  const online=process.env.RAIL_TEST_ONLINE==='1'
  const tiles={gsi:0,terrain:0,buildings:0},failures=new Set()
  page.on('response',response=>{
    if(!response.ok())return
    const url=new URL(response.url())
    if(url.hostname==='cyberjapandata.gsi.go.jp')tiles.gsi++
    if(url.hostname==='tile.plateauview.mlit.go.jp')tiles.terrain++
    if(url.hostname==='assets.cms.plateau.reearth.io'&&/b3dm|glb/.test(url.pathname))tiles.buildings++
  })
  if(online)page.on('requestfailed',request=>{if(request.url().startsWith('https:'))failures.add(new URL(request.url()).hostname+' '+request.failure()?.errorText)})
  else await page.route(/^https:\/\//,route=>route.abort())
  await page.goto(url+'/?date=2026-11-19&time=09%3A00')
  await page.locator('.route-card').nth(1).waitFor({timeout:45000})
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('/src/map.ts')))
  await page.evaluate(async()=>{
    const entries=performance.getEntriesByType('resource')
    const source=entries.find(e=>new URL(e.name).pathname==='/src/map.ts')
    const {RailwayMap}=await import(source.name)
    const update=RailwayMap.prototype.update
    RailwayMap.prototype.update=function(...args){window.testRailMap=this;return update.apply(this,args)}
  })
  await page.getByRole('button',{name:'この列車を同時走行に追加'}).click()
  await page.locator('.route-card').nth(1).click()
  await page.waitForFunction(()=>window.testRailMap?.traffic.size===1)
  await page.waitForFunction(()=>window.testRailMap?.localMesh?.ready||window.testRailMap?.flat?.city)
  const inspect=()=>page.evaluate(()=>{
    const map=window.testRailMap
    const layer=Array.from(map.traffic.values())[0]
    return {webgl:!!map.viewer,buildings:map.city?.buildings.length??0,mainCars:map.vehicle?.cars.length??0,
      otherCars:layer?.vehicle?.cars.length??0,otherLeg:layer?.state.legIndex??-1,otherProgress:layer?.state.progress,
      mainLeg:map.active,mainProgress:map.fraction,status:document.querySelector('.map-status')?.textContent}
  })
  const ready=await inspect()
  console.log('Starting state',ready)
  assert.equal(ready.webgl,true,'WebGL unexpectedly fell back to Canvas')
  assert.equal(ready.mainCars,4);assert.equal(ready.otherCars,4);assert.ok(ready.buildings>1000)
  await page.locator('aside').evaluate(e=>e.scrollTo(0,0))
  if(online){
    await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('/xyz/pale/')&&e.duration>0))
    await page.waitForTimeout(3500)
  }
  const snap=async name=>page.screenshot({path:'test-results/'+(online?'online-':'')+name+'.png'})
  await snap('osaka-3d')
  const setTime=async minute=>page.getByLabel('走行タイムライン').evaluate((input,v)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(v))
    input.dispatchEvent(new Event('input',{bubbles:true}))
  },minute)
  const earliest=await page.getByLabel('走行タイムライン').getAttribute('min')
  await setTime(Number(earliest)+.6)
  await page.waitForFunction(()=>Array.from(window.testRailMap.traffic.values())[0].state.progress>0)
  await snap('two-trains-close')
  await page.getByLabel('カメラ視点').selectOption('overview')
  const timeline=page.getByLabel('走行タイムライン')
  await timeline.focus();await timeline.press('Home');await timeline.press('PageUp')
  await page.getByLabel('再生速度',{exact:true}).selectOption('200')
  await page.getByRole('button',{name:'再生',exact:true}).click()
  await page.waitForFunction(()=>window.testRailMap?.fraction>.03&&Array.from(window.testRailMap.traffic.values())[0]?.state.progress>.03)
  await page.getByRole('button',{name:'一時停止'}).click()
  const later=await inspect()
  assert.ok(later.mainProgress!==later.otherProgress||later.mainLeg!==later.otherLeg)
  await snap('multiple-trains')
  await page.getByLabel('カメラ視点').selectOption('free')
  await page.getByLabel('地図と光の設定').click()
  await page.getByLabel('昼夜モード').selectOption('night')
  await page.getByRole('button',{name:'閉じる',exact:true}).click()
  const night=await page.evaluate(()=>({mode:window.testRailMap.light,lights:window.testRailMap.shader.uniforms.u_lamps.value}))
  assert.equal(night.mode,'night');assert.equal(night.lights,1)
  await page.getByRole('button',{name:'最初に戻る'}).click()
  await page.getByLabel('カメラ視点').selectOption('follow')
  await snap('night')
  await page.getByRole('button',{name:/同時走行.*削除|削除/}).last().click()
  await page.waitForFunction(()=>window.testRailMap.traffic.size===0)
  await page.setViewportSize({width:390,height:844})
  const close=page.getByRole('button',{name:'検索パネルを閉じる'})
  if(await close.isVisible())await close.click()
  await snap('mobile')
  assert.ok(await page.getByRole('button',{name:'再生',exact:true}).isVisible())
  assert.equal(errors.length,0,errors.join('\n'))
  console.log('Shared clock, independent trains, overview, seek, free camera, night lights, deletion and mobile passed',later)
  console.log('External HTTP success',tiles,'request failures',Array.from(failures))
}finally{await browser.close()}
