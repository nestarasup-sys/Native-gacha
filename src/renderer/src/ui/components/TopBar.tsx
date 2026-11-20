import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { Icon } from './Icon'
import { flushPendingRendererWrites } from '../pendingPersistence'
import { APPLICATION_ROUTES } from '../../../../shared/applicationRoutes'
import './TopBar.css'

const groups = [
  { tone: 'rose', label: 'Produção', sections: [
    { label: 'Customizar', path: APPLICATION_ROUTES.customizer, icon: 'bow' },
    { label: 'Roteiros', path: APPLICATION_ROUTES.roteiro, icon: 'message' },
    { label: 'Editor V6', path: APPLICATION_ROUTES.editorV6, icon: 'sparkles' },
    { label: 'Base de vídeos', path: APPLICATION_ROUTES.baseVideos, icon: 'frame' },
  ] },
  { tone: 'violet', label: 'Studio e biblioteca', sections: [
    { label: 'Studio', path: APPLICATION_ROUTES.studio, icon: 'camera' },
    { label: 'Biblioteca V6', path: APPLICATION_ROUTES.editorV6Library, icon: 'box' },
  ] },
  { tone: 'slate', label: 'Desenvolvimento', sections: [
    { label: 'Logs Dev', path: APPLICATION_ROUTES.logsDev, icon: 'settings' },
    { label: 'Fabricador Dev', path: APPLICATION_ROUTES.fabricatorDev, icon: 'box' },
    { label: 'Editor V7', path: APPLICATION_ROUTES.editorV7, icon: 'sparkles' },
  ] },
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
        <img className="top-brand-mark" src="./gacha-nymi.ico" alt="" />
        <span className="top-brand-name">Gacha <strong>Nymi</strong></span>
      </div>
      <nav className="top-navigation" aria-label="Áreas do aplicativo">
        {groups.map((group) => (
          <div className={`top-nav-group ${group.tone}`} key={group.tone} role="group" aria-label={group.label}>
            {group.sections.map((section) => (
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
          </div>
        ))}
      </nav>
      <div className="top-utilities">
        <span className="save-status" role="status"><span className="save-dot" />Salvamento automático</span>
        <button className="top-icon-button" aria-label="Notificações"><Icon name="bell" /><i /></button>
        <button className="account-button" aria-label="Minha conta">L</button>
      </div>
    </header>
  )
}
