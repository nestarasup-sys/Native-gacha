'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { compareExportReport, median, parseCli } = require('../../scripts/editor-v6/compare-real-export.cjs')
const baseline = require('../../docs/editor-v6/baselines/native_gacha_nova_baseline_2026-11-05.json')
const fixture = () => ({
  projectId: 'fixture-project',
  options: {
    startFrame:0,endFrame:309,width:1920,height:1080,turbo:true,encoder:'cpu',
    mouthLoopCycleFrames:30,hairPoseReactionOnly:true,hairPosteriorOnly:true,hairAnimationPresetSlot:2
  },
  fps:30,totalFrames:309,audioClips:0,videoInputs:0,state:'completed',fallback:false,
  attempts:[{encoder:'libopenh264',parallelism:2,parts:[{frameMetrics:{captureReadbacks:156,captureStaleReadbacks:2}},{frameMetrics:{captureReadbacks:155,captureStaleReadbacks:0}}]}],
  validation:{streams:[{codec_type:'video',codec_name:'h264',width:1920,height:1080,nb_read_frames:'309'}],seams:[154]},
  motionCache:{memoryHits:0,diskHits:0},
  motionPreparation:{preparedRigs:130,reusedRigs:11,rigBuildMilliseconds:15000,rigKeyLookups:141,rigRebuilds:3},
  phaseMilliseconds:{motionPreparation:20000,rendering:12000},
  milliseconds:36000,hairPreparation:{totalMilliseconds:9000}
})
const fakeBaseline = {...baseline,project_id_sha256:createHash('sha256').update('fixture-project').digest('hex')}
test('accepts exact cold equivalent project and emits only sanitized metrics', () => {
  const result=compareExportReport(fakeBaseline,fixture())
  assert.equal(result.compatible,true)
  assert.equal(result.totalSeconds,45)
  assert.ok(result.deltaSeconds<0)
  assert.equal(result.details.rigBuildSeconds,15)
  assert.equal(result.details.captureStaleReadbacks,2)
  assert.equal(JSON.stringify(result).includes('fixture-project'),false)
})
test('rejects same-looking different project, warm cache or altered visual configuration', () => {
  const other=fixture();other.projectId='other-project'
  assert.equal(compareExportReport(fakeBaseline,other).compatible,false)
  const warm=fixture();warm.motionCache.diskHits=1
  assert.equal(compareExportReport(fakeBaseline,warm).compatible,false)
  const wrong=fixture();wrong.options.hairAnimationPresetSlot=1
  assert.equal(compareExportReport(fakeBaseline,wrong).compatible,false)
  const muted=fixture();muted.options.width=1280
  assert.equal(compareExportReport(fakeBaseline,muted).compatible,false)
})
test('rejects incomplete MP4 or fallback, even when wall time improves', () => {
  const broken=fixture();broken.validation.streams[0].nb_read_frames='308'
  assert.equal(compareExportReport(fakeBaseline,broken).compatible,false)
  const fallback=fixture();fallback.fallback=true
  assert.equal(compareExportReport(fakeBaseline,fallback).compatible,false)
})
test('median and flags have no outlier bias', () => {
  assert.equal(median([99,25,30]),30)
  assert.equal(median([30,20]),25)
  assert.equal(median([]),null)
  assert.equal(parseCli(['--candidate=one.json','--candidate=two.json','--json']).candidates.length,2)
  assert.throws(()=>parseCli(['--not-allowed']))
})
