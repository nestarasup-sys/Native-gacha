const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
async function main() {
 if (!process.versions.electron) {
  const { build } = require('esbuild'), { spawn } = require('node:child_process')
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'editor-v6-motion-check-')), bundle = path.join(folder,'motion.js')
  await build({entryPoints:[path.resolve(__dirname,'../../tests/editor-v6/motion.browser.ts')],outfile:bundle,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},target:'chrome140',logLevel:'warning'})
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const child=spawn(require('electron'),[__filename,bundle,folder],{stdio:'inherit',windowsHide:true,env})
  process.exitCode=await new Promise((yes,no)=>{child.on('error',no);child.on('exit',yes)});return
 }
 const {app,BrowserWindow}=require('electron'),folder=process.argv[3]
 app.setPath('userData',path.join(folder,'profile'));await app.whenReady()
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}})
 const timer=setTimeout(()=>app.exit(1),60000)
 try {
  const html=path.join(folder,'index.html');await fs.writeFile(html,'<!doctype html><html><body></body></html>');await w.loadFile(html)
  await w.webContents.executeJavaScript(await fs.readFile(process.argv[2],'utf8'))
  const result=await w.webContents.executeJavaScript('globalThis.runMotionCheck()')
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));clearTimeout(timer);w.destroy();app.exit(0)
 } catch(error){console.error(error);clearTimeout(timer);w.destroy();app.exit(1)}
}
main().catch(e=>{console.error(e);process.exit(1)})
