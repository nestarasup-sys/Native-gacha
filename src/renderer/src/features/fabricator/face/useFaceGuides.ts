import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { FaceGuideProfile, FaceGuideSettings } from '../../../../../shared/fabricator'

type FaceGuideMap = Partial<Record<number, FaceGuideSettings>>
type ProfileMaps = Record<FaceGuideProfile, FaceGuideMap>

export const defaultFaceGuide: FaceGuideSettings = {
  visible: true, verticalX: 50, horizontalY: 45, lowerHorizontalY: 65, angle: 12
}

const storageKeys: Record<FaceGuideProfile, string> = {
  eyes: 'gacha-nymi:eyes-dev-guides',
  face: 'gacha-nymi:rosto-dev-guides',
  'head-extras': 'gacha-nymi:head-extra-dev-guides'
}
const legacyStorageKeys: Record<FaceGuideProfile, string[]> = {
  eyes: ['gacha-nymi:face-dev-guides', 'gacha-nymi:rosto-dev-guides'],
  face: ['gacha-nymi:face-dev-guides'],
  'head-extras': ['gacha-nymi:rosto-dev-guides', 'gacha-nymi:face-dev-guides']
}
const previousProfiles: Record<FaceGuideProfile, FaceGuideProfile> = {
  eyes: 'face', face: 'eyes', 'head-extras': 'face'
}
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

function normalizeGuides(value: unknown): FaceGuideMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([slot, guide]) =>
    /^([1-9]|10)$/.test(slot) && guide && typeof guide === 'object' && !Array.isArray(guide)
  ).map(([slot, raw]) => {
    const guide = raw as Partial<FaceGuideSettings>
    const horizontalY = clamp(guide.horizontalY, defaultFaceGuide.horizontalY, 10, 90)
    return [Number(slot), {
      visible: guide.visible !== false,
      verticalX: clamp(guide.verticalX, defaultFaceGuide.verticalX, 20, 80),
      horizontalY,
      lowerHorizontalY: Math.max(horizontalY + 1, clamp(guide.lowerHorizontalY, defaultFaceGuide.lowerHorizontalY, 11, 99)),
      angle: clamp(guide.angle, defaultFaceGuide.angle, -30, 30)
    }]
  }))
}

function readStoredGuides(profile: FaceGuideProfile): FaceGuideMap {
  try {
    for (const key of [storageKeys[profile], ...legacyStorageKeys[profile]]) {
      const stored = window.localStorage.getItem(key)
      if (stored === null) continue
      const normalized = normalizeGuides(JSON.parse(stored))
      if (Object.keys(normalized).length > 0) return normalized
    }
  } catch { /* Persistent app data remains authoritative when browser storage is unavailable. */ }
  return {}
}

function writeStoredGuides(profile: FaceGuideProfile, guides: FaceGuideMap): void {
  try { window.localStorage.setItem(storageKeys[profile], JSON.stringify(guides)) }
  catch { /* The durable Fabricator profile remains available. */ }
}

export function useFaceGuides(profile: FaceGuideProfile, reportError: Dispatch<SetStateAction<string>>) {
  const [guidesByProfile, setGuidesByProfile] = useState<ProfileMaps>(() => ({
    eyes: readStoredGuides('eyes'), face: readStoredGuides('face'), 'head-extras': readStoredGuides('head-extras')
  }))
  const guidesRef = useRef(guidesByProfile)
  const loadedProfileRef = useRef<FaceGuideProfile | null>(null)
  const [loadedProfile, setLoadedProfile] = useState<FaceGuideProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    loadedProfileRef.current = null
    setLoadedProfile(null)

    void window.desktop.loadFaceGuides(profile).then(async (saved) => {
      if (cancelled) return
      let next = saved ? normalizeGuides(saved) : guidesRef.current[profile]
      if (!saved) {
        // The previous shared profile may be the only durable copy from versions
        // that stored eye and face guides together. Copy it once, then diverge.
        if (Object.keys(next).length === 0) {
          const previous = await window.desktop.loadFaceGuides(previousProfiles[profile])
          if (previous) next = normalizeGuides(previous)
        }
        if (Object.keys(next).length === 0) next = readStoredGuides(profile)
        await window.desktop.saveFaceGuides(profile, next)
      }
      if (cancelled) return
      guidesRef.current = { ...guidesRef.current, [profile]: next }
      setGuidesByProfile(guidesRef.current)
      writeStoredGuides(profile, next)
      loadedProfileRef.current = profile
      setLoadedProfile(profile)
    }).catch((reason) => {
      if (cancelled) return
      const fallback = readStoredGuides(profile)
      guidesRef.current = { ...guidesRef.current, [profile]: fallback }
      setGuidesByProfile(guidesRef.current)
      loadedProfileRef.current = profile
      setLoadedProfile(profile)
      reportError(reason instanceof Error ? reason.message : String(reason))
    })

    return () => { cancelled = true; if (loadedProfileRef.current === profile) loadedProfileRef.current = null }
  }, [profile, reportError])

  const updateGuide = useCallback((modelSlot: number, patch: Partial<FaceGuideSettings>) => {
    if (loadedProfileRef.current !== profile) return
    const nextProfile = {
      ...guidesRef.current[profile],
      [modelSlot]: { ...(guidesRef.current[profile][modelSlot] ?? defaultFaceGuide), ...patch }
    }
    guidesRef.current = { ...guidesRef.current, [profile]: nextProfile }
    setGuidesByProfile(guidesRef.current)
    writeStoredGuides(profile, nextProfile)
    void window.desktop.saveFaceGuides(profile, nextProfile).catch((reason) =>
      reportError(reason instanceof Error ? reason.message : String(reason)))
  }, [profile, reportError])

  return {
    guidesByModel: guidesByProfile[profile],
    guidesLoaded: loadedProfile === profile,
    updateGuide
  }
}
