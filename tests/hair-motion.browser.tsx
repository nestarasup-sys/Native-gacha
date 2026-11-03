import { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { HairMotionMesh } from '../src/renderer/src/features/fabricator/hair-animation/HairMotionMesh'
import { HairAnimationWorkspace } from '../src/renderer/src/features/fabricator/hair-animation/HairAnimationWorkspace'

function Fixture({ source, playing }: { source: string; playing: boolean }) {
  const headX = useRef(0)
  return <div style={{ position: 'absolute', left: 100, top: 100, width: 100, height: 100 }}><HairMotionMesh source={source} name="teste" settings={{ wind: 90, gust: 0, stiffness: 40, damping: 50, responsiveness: 50, anchor: 15, speed: 100, enabled: true }} intensity={100} playing={playing} headX={headX} impulse={0} resetToken={0} phase={0} flipped={false} /></div>
}

declare global { interface Window { runHairMotionFixture: () => Promise<void>; startHairMotionFixture: () => Promise<void>; runAlphaHairFixture: () => Promise<void>; runHairWorkspaceFixture: () => Promise<void> } }
window.runHairMotionFixture = async () => {
  const source = document.createElement('canvas'); source.width = 64; source.height = 64
  const context = source.getContext('2d')!
  context.fillStyle = '#ff0000'; context.fillRect(0, 0, 64, 32)
  context.fillStyle = '#0000ff'; context.fillRect(0, 32, 64, 32)
  const root = createRoot(document.getElementById('root')!), url = source.toDataURL()
  root.render(<Fixture source={url} playing={false} />)
  window.startHairMotionFixture = async () => { root.render(<Fixture source={url} playing />); await new Promise<void>((resolve) => setTimeout(resolve, 2000)) }
  window.runAlphaHairFixture = async () => {
    const transparent = document.createElement('canvas'); transparent.width = 64; transparent.height = 64
    const ctx = transparent.getContext('2d')!; ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(0, 0, 64, 64)
    root.render(<Fixture source={transparent.toDataURL()} playing={false} />)
    await new Promise<void>((resolve) => setTimeout(resolve, 500))
  }
  window.runHairWorkspaceFixture = async () => {
    const headCanvas = document.createElement('canvas'); headCanvas.width = 100; headCanvas.height = 120
    const headContext = headCanvas.getContext('2d')!; headContext.fillStyle = '#e8ad8a'; headContext.beginPath(); headContext.ellipse(50, 60, 43, 56, 0, 0, Math.PI * 2); headContext.fill()
    const hairCanvas = document.createElement('canvas'); hairCanvas.width = 120; hairCanvas.height = 130
    const hairContext = hairCanvas.getContext('2d')!; hairContext.fillStyle = '#713e60'; hairContext.beginPath(); hairContext.ellipse(60, 60, 55, 58, 0, Math.PI, Math.PI * 2); hairContext.lineTo(110, 110); hairContext.lineTo(10, 110); hairContext.closePath(); hairContext.fill()
    const part = { id: 'head', name: 'Cabeça', x: 0, y: 0, width: 100, height: 120, rotation: 0, dataUrl: headCanvas.toDataURL() }
    const asset = { width: 120, height: 130, dataUrl: hairCanvas.toDataURL() }
    const transform = { x: 50, y: 60, scaleX: 1, scaleY: 1, rotation: 0 }
    const style = { id: 'hair', name: 'Cabelo de teste', front: asset, back: asset, fringe: null, transforms: { front: transform, back: transform } }
    Object.defineProperty(window, 'desktop', { configurable: true, value: { fabricator: {
      listFabricatorSlots: async () => [{ slot: 1, name: 'Modelo teste' }],
      loadFabricatorSlot: async () => ({ slot: 1, name: 'Modelo teste', parts: [part], joints: [], width: 100, height: 120 }),
      listHairStyles: async () => [style], loadHairStyle: async () => style
    } } })
    root.render(<HairAnimationWorkspace baseModelSlot={1} />)
    await new Promise<void>((resolve) => setTimeout(resolve, 300))
    const selects = document.querySelectorAll('select')
    if (selects.length !== 4) throw new Error('Seletores da área não foram carregados.')
    selects[1].value = 'hair'; selects[1].dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise<void>((resolve) => setTimeout(resolve, 700))
    if (!document.querySelector('.hair-motion-mesh') || document.querySelector('.hair-motion-error')) throw new Error('Cabelo não carregou na prévia.')
    const buttons = [...document.querySelectorAll('button')]
    const pause = buttons.find((button) => button.textContent === 'Pausar')
    pause?.click()
    if (!pause) throw new Error('Controle de reprodução ausente.')
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
    if (![...document.querySelectorAll('button')].some((button) => button.textContent === 'Reproduzir')) throw new Error('A pausa não foi aplicada.')
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 700))
  const error = document.querySelector('.hair-motion-error')
  if (error) throw new Error(error.textContent ?? 'Falha na malha')
}
