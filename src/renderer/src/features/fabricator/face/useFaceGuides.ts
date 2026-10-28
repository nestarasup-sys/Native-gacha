import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { FaceGuideProfile, FaceGuideSettings } from '../../../../../shared/fabricator'

type FaceGuideMap = Partial<Record<number, FaceGuideSettings>>
type ProfileMaps = Record<FaceGuideProfile, FaceGuideMap>
type LegacyFaceGuideProfile = Exclude<FaceGuideProfile, 'shared'>
type LegacyGuideCandidate = { profile: LegacyFaceGuideProfile; slot: number; guide: FaceGuideSettings; sourcePriority: number }

const legacyFaceGuideProfiles: LegacyFaceGuideProfile[] = ['eyes', 'face', 'head-extras']

export const defaultFaceGuide: FaceGuideSettings = {
  visible: true, verticalX: 50, horizontalY: 45, lowerHorizontalY: 65, angle: 12
}

const storageKeys: Record<FaceGuideProfile, string> = {
  eyes: 'gacha-nymi:eyes-dev-guides',
  face: 'gacha-nymi:rosto-dev-guides',
  'head-extras': 'gacha-nymi:head-extra-dev-guides',
  shared: 'gacha-nymi:shared-head-guides'
}
const legacyStorageKeys: Record<FaceGuideProfile, string[]> = {
  eyes: ['gacha-nymi:face-dev-guides', 'gacha-nymi:rosto-dev-guides'],
  face: ['gacha-nymi:face-dev-guides'],
  'head-extras': ['gacha-nymi:rosto-dev-guides', 'gacha-nymi:face-dev-guides'],
  shared: []
}
const previousProfiles: Record<LegacyFaceGuideProfile, LegacyFaceGuideProfile> = {
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

function guideCustomizationScore(guide: FaceGuideSettings): number {
  return Number(guide.visible !== defaultFaceGuide.visible)
    + Number(guide.verticalX !== defaultFaceGuide.verticalX)
    + Number(guide.horizontalY !== defaultFaceGuide.horizontalY)
    + Number(guide.lowerHorizontalY !== defaultFaceGuide.lowerHorizontalY)
    + Number(guide.angle !== defaultFaceGuide.angle)
}

function mergeLegacyGuides(candidates: LegacyGuideCandidate[]): FaceGuideMap {
  const bySlot = new Map<number, LegacyGuideCandidate[]>()
  for (const candidate of candidates) {
    const slotCandidates = bySlot.get(candidate.slot) ?? []
    slotCandidates.push(candidate)
    bySlot.set(candidate.slot, slotCandidates)
  }
  const profilePriority: Record<LegacyFaceGuideProfile, number> = { eyes: 0, face: 1, 'head-extras': 2 }
  return Object.fromEntries([...bySlot.entries()].map(([slot, slotCandidates]) => {
    // Prefer the most configured existing guide. Ties favor durable data, then
    // Eyes DEV, Rosto DEV and Cabeças Extra DEV in that order.
    slotCandidates.sort((left, right) => guideCustomizationScore(right.guide) - guideCustomizationScore(left.guide)
      || left.sourcePriority - right.sourcePriority
      || profilePriority[left.profile] - profilePriority[right.profile])
    return [slot, slotCandidates[0].guide]
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
    eyes: readStoredGuides('eyes'), face: readStoredGuides('face'), 'head-extras': readStoredGuides('head-extras'), shared: readStoredGuides('shared')
  }))
  const guidesRef = useRef(guidesByProfile)
  const loadedProfileRef = useRef<FaceGuideProfile | null>(null)
  const [loadedProfile, setLoadedProfile] = useState<FaceGuideProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    loadedProfileRef.current = null
    setLoadedProfile(null)

    void window.desktop.fabricator.loadFaceGuides(profile).then(async (saved) => {
      if (cancelled) return
      let next: FaceGuideMap
      if (saved !== null) {
        next = normalizeGuides(saved)
      } else if (profile === 'shared') {
        const legacySnapshots = await Promise.all(legacyFaceGuideProfiles.map(async (legacyProfile) => ({
          profile: legacyProfile,
          saved: await window.desktop.fabricator.loadFaceGuides(legacyProfile),
          local: guidesRef.current[legacyProfile]
        })))
        const candidates: LegacyGuideCandidate[] = []
        for (const snapshot of legacySnapshots) {
          const durable = snapshot.saved === null ? {} : normalizeGuides(snapshot.saved)
          for (const [slot, guide] of Object.entries(durable)) {
            if (guide) candidates.push({ profile: snapshot.profile, slot: Number(slot), guide, sourcePriority: 0 })
          }
          for (const [slot, guide] of Object.entries(snapshot.local)) {
            if (guide) candidates.push({ profile: snapshot.profile, slot: Number(slot), guide, sourcePriority: 1 })
          }
        }
        next = mergeLegacyGuides(candidates)
      } else {
        next = guidesRef.current[profile]
      }

      if (saved === null) {
        // Older profiles keep their original one-time compatibility fallback.
        // The shared profile above imports all existing profiles before it is
        // written, so later edits have one durable source of truth.
        if (profile !== 'shared') {
          if (Object.keys(next).length === 0) {
            const previous = await window.desktop.fabricator.loadFaceGuides(previousProfiles[profile])
            if (previous) next = normalizeGuides(previous)
          }
          if (Object.keys(next).length === 0) next = readStoredGuides(profile)
        }
        await window.desktop.fabricator.saveFaceGuides(profile, next)
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
      // Local data is preview-only in failure mode. Do not allow the controls
      // to overwrite an invalid but existing Fabricador JSON on disk.
      loadedProfileRef.current = null
      setLoadedProfile(null)
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
    void window.desktop.fabricator.saveFaceGuides(profile, nextProfile).catch((reason) =>
      reportError(reason instanceof Error ? reason.message : String(reason)))
  }, [profile, reportError])

  return {
    guidesByModel: guidesByProfile[profile],
    guidesLoaded: loadedProfile === profile,
    updateGuide
  }
}
