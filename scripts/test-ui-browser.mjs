import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import assert from 'node:assert/strict'

// Serve the production build below the same repository subpath used by Pages.
const prefix='/Japan-Railway-3D-Simulator/'
const root=resolve('dist')
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.glb':'model/gltf-binary','.wasm':'application/wasm'}
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return}
    const relative=pathname.slice(prefix.length)||'index.html'
    const file=resolve(root,relative)
    if(!file.startsWith(root+String.fromCharCode(92)) && !file.startsWith(root+'/')){res.writeHead(403);res.end();return}
    const bytes=await readFile(file)
    res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'})
    res.end(bytes)
  }catch{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(5181,'127.0.0.1',r))
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  const page=await browser.newPage({viewport:{width:1440,height:980}})
  const errors=[],failed=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:5181/')&&r.status()>=400)failed.push(r.url())})
  await page.route('https://**/*',route=>route.abort())
  const url='http://127.0.0.1:5181'+prefix
  await page.goto(url+'?date=2026-11-20&time=09:00')
  await page.locator('.route-card').first().waitFor()
  assert.ok(await page.locator('.route-card').count()>=2)
  await page.getByRole('button',{name:'経由駅を追加'}).click()
  await page.getByRole('combobox',{name:'経由駅 1',exact:true}).fill('新大阪')
  await page.getByRole('option').filter({hasText:'新大阪'}).first().click()
  await page.getByRole('button',{name:'経由駅を追加'}).click()
  await page.getByRole('combobox',{name:'経由駅 2',exact:true}).fill('高槻')
  await page.getByRole('option').filter({hasText:'高槻'}).first().click()
  await page.getByRole('button',{name:'経路を検索',exact:true}).click()
  await page.locator('.route-card').first().waitFor()
  await page.getByRole('button',{name:'共有リンクをコピー'}).click()
  assert.deepEqual(new URL(page.url()).searchParams.getAll('via'),['新大阪','高槻'])
  await page.reload()
  await page.locator('.route-card').first().waitFor()
  assert.equal(await page.getByRole('combobox',{name:'経由駅 1',exact:true}).inputValue(),'新大阪')
  await page.getByRole('button',{name:'経由駅 2を前に移動',exact:true}).click()
  assert.equal(await page.getByRole('combobox',{name:'経由駅 1',exact:true}).inputValue(),'高槻')
  await page.getByRole('button',{name:'経由駅 2を削除',exact:true}).click()
  await page.getByRole('button',{name:'経由駅 1を削除',exact:true}).click()
  await page.getByRole('button',{name:'経路を検索',exact:true}).click()
  await page.locator('.route-card').first().waitFor()
  await page.getByRole('button',{name:'この列車を同時走行に追加',exact:true}).click()
  await page.locator('.route-card').nth(1).click()
  await page.getByRole('button',{name:'この列車を同時走行に追加',exact:true}).click()
  assert.equal(await page.locator('.traffic-entry').count(),2)
  await page.getByRole('button',{name:'再生',exact:true}).click()
  await page.waitForTimeout(250)
  await page.getByRole('button',{name:'一時停止',exact:true}).click()
  await page.getByLabel('走行タイムライン').focus()
  await page.getByLabel('走行タイムライン').press('Home')
  await page.getByLabel('走行タイムライン').press('PageUp')
  await page.getByRole('button',{name:'神戸地下鉄',exact:true}).click()
  await page.locator('.route-card').first().waitFor()
  assert.match(await page.locator('.route-card').first().textContent(),/実ダイヤ/)
  assert.equal(await page.locator('.traffic-entry').count(),2)
  await page.getByRole('button',{name:'この列車を同時走行に追加',exact:true}).click()
  assert.equal(await page.locator('.traffic-entry').count(),3)
  await page.locator('.traffic-entry button').first().click()
  assert.equal(await page.locator('.traffic-entry').count(),2)
  await page.getByRole('button',{name:'駅時刻表',exact:true}).click()
  await page.locator('.board-hour').first().waitFor()
  assert.ok(await page.locator('.board-hour').count()>10)
  await page.getByRole('button',{name:'閉じる',exact:true}).click()
  await page.getByRole('combobox',{name:'到着駅',exact:true}).fill('未登録の駅')
  await page.getByRole('button',{name:'経路を検索',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(),/候補/)
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(failed,[])
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({productionSubpath:'passed',viaOrdering:'passed',shareReload:'passed',threeTrains:'passed',playSeekRemove:'passed',actualTimetable:'passed',invalidStation:'passed',mobileOverflow:'passed',local404s:failed.length,pageErrors:errors.length}))
}finally{
  await browser.close()
  server.closeAllConnections()
  await new Promise(r=>server.close(r))
}

