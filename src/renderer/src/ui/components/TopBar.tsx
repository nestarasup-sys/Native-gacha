import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { Icon } from './Icon'
import { flushPendingRendererWrites } from '../pendingPersistence'

const sections = [
  { label: 'Studio', path: '/estudio', icon: 'camera' },
  { label: 'EDITOR V6', path: '/editor-v6', icon: 'sparkles' },
  { label: 'Roteiros', path: '/roteiros', icon: 'message' },
  { label: 'Base de vídeos', path: '/base-videos', icon: 'frame' },
  { label: 'Customizar', path: '/customizar', icon: 'bow' },
  { label: 'Opções', path: '/opcoes', icon: 'settings' },
  { label: 'Fabricador Dev', path: '/fabricador-dev', icon: 'box' }
] as const

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationRequest = useRef(0)

  const navigateAfterFlush = (event: ReactMouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || path === location.pathname) return
    event.preventDefault()
    const request = ++navigationRequest.current
    void flushPendingRendererWrites().then(() => {
      if (request === navigationRequest.current) navigate(path)
    }).catch((reason: unknown) => {
      if (request !== navigationRequest.current) return
      const detail = reason instanceof Error ? `\n\n${reason.message}` : ''
      window.alert(`Não foi possível salvar as alterações antes de sair desta área. Ela continuará aberta para você tentar novamente.${detail}`)
    })
  }

  return (
    <header className="top-bar">
      <div className="top-brand">
        <img className="top-brand-mark" src="./gacha-nymi.ico" alt="Logo Gacha Nymi" />
        <span className="top-brand-name">Gacha Nymi<span>estúdio criativo</span></span>
      </div>
      <span className="top-divider" />
      <nav className="top-navigation" aria-label="Áreas do aplicativo">
        {sections.map((section) => (
          <NavLink
            className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}
            key={section.path}
            onClick={(event) => navigateAfterFlush(event, section.path)}
            to={section.path}
          >
            <Icon name={section.icon} />
            <span>{section.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="topbar-spacer" />
      <span className="save-status" role="status"><span className="save-dot" />Salvamento automático</span>
      <button className="top-icon-button" aria-label="Notificações"><Icon name="bell" /><i /></button>
      <button className="account-button" aria-label="Minha conta">L</button>
    </header>
  )
}
