'use strict'

// Existing audits remain assertion owners; catalog makes their prerequisites
// and data-safety expectations explicit.
const audits = Object.freeze([
  { id: 'expression-transforms', file: 'scripts/audit-expression-transforms.mjs', mode: 'node', suite: 'fast', data: 'synthetic', requires: ['typescript'] },
  { id: 'hair-eraser', file: 'scripts/audit-hair-eraser.mjs', mode: 'node', suite: 'fast', data: 'synthetic', requires: ['typescript'] },
  { id: 'hair-persistence', file: 'scripts/audit-hair-persistence.mjs', mode: 'node', suite: 'fast', data: 'synthetic', requires: ['typescript'] },
  { id: 'video-library', file: 'scripts/audit-video-library.mjs', mode: 'node', suite: 'fast', data: 'synthetic', requires: ['typescript'], writes: 'out/audit-video-library/<uuid>' },
  { id: 'wardrobe-flow', file: 'scripts/audit-wardrobe-flow.mjs', mode: 'node', suite: 'fast', data: 'synthetic', requires: ['typescript'], note: 'Fabricator source -> pose -> Customizer character-only placement contracts' },
  { id: 'wardrobe-v2-compatibility', file: 'scripts/audit-wardrobe-v2-compatibility.mjs', mode: 'node', suite: 'fast', data: 'synthetic', requires: ['typescript'], note: 'Reject all ten shuffled or invalid source sheet frames' },
  { id: 'animator-rig', file: 'scripts/audit-animator-rig.mjs', mode: 'node', suite: 'manual', data: 'real-by-default', requires: ['explicit-synthetic-project-path'], note: 'EXCLUDED: without explicit path this audit reads APPDATA' }
])

function selected(suite) {
  if (suite === 'fast') return audits.filter(a => a.suite === 'fast')
  if (suite === 'all') return audits.filter(a => a.suite === 'fast')
  throw new Error(`Suite desconhecida: ${suite}`)
}

module.exports = { audits, selected }
