import { useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { EDITOR_V6_REACT_IMPORT_FORMAT, parseEditorV6ReactImport, resolveEditorV6ReactVideos, type EditorV6ReactImport } from '../../../../shared/editorV6ReactImport'
import { compileEditorV6ReactImport, prepareEditorV6ReactSources } from './editorV6ReactImportCompiler'

type Props={
  characters: CustomizerCharacter[]
  onClose:()=>void
  onSave:(document:EditorV6Document)=>Promise<void>
  onImported:(document:EditorV6Document)=>void
}
export function EditorV6ReactImportDialog({characters,onClose,onSave,onImported}:Props){
  const input=useRef<HTMLInputElement>(null)
  const [source,setSource]=useState<EditorV6ReactImport|null>(null)
  const [filename,setFilename]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [progress,setProgress]=useState('')
  const [warnings,setWarnings]=useState<string[]>([])
  const [verified,setVerified]=useState(false)
  const [checking,setChecking]=useState(false)
  const inspect=async(file?:File)=>{
    if(!file)return
    setError('');setProgress('');setWarnings([]);setSource(null);setVerified(false);setFilename(file.name)
    if(file.size>2_000_000){setError('O JSON excede o limite de 2 MB.');return}
    try{
      const parsed=parseEditorV6ReactImport(JSON.parse(await file.text()) as unknown)
      setChecking(true)
      const [library,details]=await Promise.all([window.desktop.mediaLibrary.list(),window.desktop.baseVideos.listDetails()])
      const resolved=resolveEditorV6ReactVideos(parsed,library,details)
      setSource(resolved)
      const ids=new Set(library.filter((item)=>item.available).map((item)=>item.id))
      const backgrounds=parsed.backgroundLibraryId?await window.desktop.videoBackgrounds.listVideoBackgroundLibrary():[]
      const missingBackground=parsed.backgroundLibraryId&&!backgrounds.some((item)=>item.id===parsed.backgroundLibraryId&&item.available)
      const missingVideos=[...new Set(resolved.videos.map((item)=>item.videoId))].filter((id)=>!id||!ids.has(id))
      const missingCharacters=parsed.cast.filter((actor)=>{
        const key=actor.character.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
        return !characters.some((item)=>item.id.toLowerCase()===key||item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===key)
      })
      if(missingVideos.length||missingCharacters.length||missingBackground){
        setError([
          ...missingVideos.map((id)=>'Vídeo ausente na Base de Vídeos: '+id),
          ...(missingBackground?['Fundo ausente na biblioteca: '+parsed.backgroundLibraryId]:[]),
          ...missingCharacters.map((actor)=>'Personagem não encontrado: '+actor.character)
        ].join('\n'))
      }else{
        setVerified(true)
        setWarnings(parsed.videos.length===0?['O JSON não contém vídeos; apenas elenco, falas e atuações.']:[])
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Arquivo JSON inválido.')}
    finally{setChecking(false);if(input.current)input.current.value=''}
  }
  const run=async()=>{
    if(!source||!verified||busy)return
    setBusy(true);setError('');setProgress('Consultando as poses e expressões reais…')
    try{
      const sources=await prepareEditorV6ReactSources(source,characters)
      const prepared=await compileEditorV6ReactImport(source,sources,setProgress)
      setWarnings(prepared.warnings)
      setProgress('Salvando projeto e imagens…')
      await onSave(prepared.document)
      onImported(prepared.document)
    }catch(reason){setError(reason instanceof Error?reason.message:'Falha ao importar o projeto.');setProgress('')}
    finally{setBusy(false)}
  }
  return <div className="roteiro-modal-backdrop" role="presentation">
    <section className="base-videos-ai-modal" role="dialog" aria-modal="true" aria-label="Importar react JSON no Editor V6">
      <header><h2>Importar react JSON · Editor V6</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></header>
      <p>Importe o formato <code>{EDITOR_V6_REACT_IMPORT_FORMAT}</code>. O editor vincula personagens e vídeos reais e prepara as imagens antes de criar um projeto novo.</p>
      <p>O projeto atual não será alterado. Os textos serão preservados literalmente.</p>
      <input type="file" ref={input} accept="application/json,.json" hidden disabled={busy||checking} onChange={(event)=>void inspect(event.target.files?.[0])}/>
      <button type="button" className="studio-action" disabled={busy||checking} onClick={()=>input.current?.click()}>Selecionar JSON</button>
      {filename&&<p><strong>Arquivo:</strong> {filename}</p>}
      {source&&<p><strong>{source.title}</strong> · {source.cast.length} personagens · {source.videos.length} vídeos · {source.lines.length} falas/pensamentos · {source.beats.length} atuações</p>}
      {warnings.length>0&&<p role="status">{warnings.join(' | ')}</p>}
      {progress&&<p role="status">{progress}</p>}
      {error&&<pre role="alert" style={{whiteSpace:'pre-wrap',maxHeight:180,overflow:'auto'}}>{error}</pre>}
      <footer style={{display:'flex',gap:12,marginTop:16}}>
        <button type="button" className="studio-action" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="studio-action studio-action-primary" disabled={!source||!verified||checking||busy} onClick={()=>void run()}>{busy?'Preparando projeto…':'Validar e criar projeto'}</button>
      </footer>
    </section>
  </div>
}
