'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let createSpinPlan;
let sampleSpinPlan;

before(async () => {
  ({ createSpinPlan, sampleSpinPlan } = await import('../src/features/wheel/spinMotion.mjs'));
});

function makePlan(overrides = {}) {
  return createSpinPlan({
    startRotation: 0.7,
    finalRotation: 72.4,
    durationMs: 5_000,
    sliceAngle: Math.PI / 5,
    randomOffset: 0.5,
    recoil: false,
    recoilRatio: 0.04,
    falseFinish: false,
    falseFinishDepthRatio: 0.15,
    ...overrides,
  });
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

test('spin plan starts and finishes at exact requested endpoints', () => {
  const plan = makePlan();

  assert.deepEqual(sampleSpinPlan(plan, -100), {
    rotation: plan.startRotation,
    progress: 0,
    phase: 'anticipation',
    speed: 0,
  });
  assert.deepEqual(sampleSpinPlan(plan, plan.durationMs), {
    rotation: plan.finalRotation,
    progress: 1,
    phase: 'settle',
    speed: 0,
  });
  assert.equal(sampleSpinPlan(plan, plan.durationMs + 1_000).rotation, plan.finalRotation);
});

test('recoil happens only when its flag is enabled', () => {
  const withoutFlag = makePlan({ recoil: false, recoilRatio: 0.05 });
  const withFlag = makePlan({ recoil: true, recoilRatio: 0.05 });

  assert.equal(withoutFlag.recoil, false);
  assert.equal(withoutFlag.recoilDelta, 0);
  assert.equal(withoutFlag.mainTargetRotation, withoutFlag.finalRotation);
  assert.equal(withFlag.recoil, true);
  assert.ok(withFlag.recoilDelta > 0);
  assert.ok(withFlag.mainTargetRotation > withFlag.finalRotation);
});

test('regular recoil remains inside the selected slice', () => {
  const sliceAngle = 0.8;
  const randomOffset = 0.02;
  const plan = makePlan({
    sliceAngle,
    randomOffset,
    recoil: true,
    recoilRatio: 1,
  });
  const clearanceLimit = 0.55 * Math.min(randomOffset, 1 - randomOffset) * sliceAngle;

  assert.equal(plan.falseFinish, false);
  assert.ok(plan.recoilDelta <= clearanceLimit + Number.EPSILON);
  assert.ok(plan.recoilDelta <= 0.06 * sliceAngle + Number.EPSILON);
});

test('false finish moves only 2-4 degrees for both wide and narrow slices', () => {
  for (const { movieCount, recoilDegrees, winnerShare } of [
    { movieCount: 2, recoilDegrees: 2, winnerShare: 0.45 },
    { movieCount: 60, recoilDegrees: 4, winnerShare: 0.55 },
  ]) {
    const sliceAngle = (Math.PI * 2) / movieCount;
    const sliceDegrees = 360 / movieCount;
    const winnerOffsetDegrees = recoilDegrees * winnerShare;
    const randomOffset = winnerOffsetDegrees / sliceDegrees;
    const falseFinishDepthRatio = (recoilDegrees - winnerOffsetDegrees) / sliceDegrees;
    const plan = makePlan({
      sliceAngle,
      randomOffset,
      recoil: true,
      falseFinish: true,
      falseFinishDepthRatio,
    });
    const firstBoundary = randomOffset * sliceAngle;
    const secondBoundary = (randomOffset + 1) * sliceAngle;
    const expectedDelta = degreesToRadians(recoilDegrees);

    assert.equal(plan.falseFinish, true);
    assert.ok(Math.abs(plan.recoilDelta - expectedDelta) < 1e-12);
    assert.ok(plan.recoilDegrees >= 2 && plan.recoilDegrees <= 4);
    assert.ok(
      plan.recoilDelta > firstBoundary,
      'the overshoot must temporarily put the pointer into the adjacent slice',
    );
    assert.ok(
      plan.recoilDelta < secondBoundary,
      'the overshoot must not skip past the adjacent slice',
    );
    assert.equal(
      sampleSpinPlan(plan, plan.phaseTimes.brakeEndMs).rotation,
      plan.mainTargetRotation,
    );
    assert.equal(
      sampleSpinPlan(plan, plan.phaseTimes.brakeEndMs).phase,
      'false-finish',
    );
    assert.ok(plan.falseFinishHoldDurationMs >= 280);
    assert.ok(plan.falseFinishHoldDurationMs <= 340);
    assert.ok(plan.rollbackDurationMs >= 950);
    assert.ok(plan.rollbackDurationMs <= 1100);
    assert.equal(
      sampleSpinPlan(
        plan,
        plan.phaseTimes.brakeEndMs + plan.falseFinishHoldDurationMs / 2,
      ).speed,
      0,
    );

    let peakRollbackSpeed = 0;
    for (
      let elapsed = plan.phaseTimes.falseFinishEndMs;
      elapsed <= plan.durationMs;
      elapsed += 5
    ) {
      peakRollbackSpeed = Math.max(
        peakRollbackSpeed,
        Math.abs(sampleSpinPlan(plan, elapsed).speed),
      );
    }
    assert.ok(peakRollbackSpeed <= degreesToRadians(8) / 1000);

    const halfwayBack = sampleSpinPlan(
      plan,
      plan.phaseTimes.falseFinishEndMs + plan.rollbackDurationMs / 2,
    );
    assert.equal(halfwayBack.phase, 'settle');
    assert.ok(halfwayBack.speed < 0, 'the wheel must move backwards during recoil');
    assert.equal(sampleSpinPlan(plan, plan.durationMs).rotation, plan.finalRotation);
  }
});

test('all phases are reachable and main travel is monotonic', () => {
  const sliceAngle = Math.PI / 5;
  const recoilDegrees = 3;
  const naturalRatio = (recoilDegrees / 2) / (sliceAngle * 180 / Math.PI);
  const plan = makePlan({
    sliceAngle,
    randomOffset: naturalRatio,
    recoil: true,
    falseFinish: true,
    falseFinishDepthRatio: naturalRatio,
  });
  const phases = new Set();
  let previousMainRotation = plan.startRotation;
  let previousSettleRotation = plan.mainTargetRotation;

  for (let elapsed = 0; elapsed <= plan.durationMs; elapsed += 5) {
    const sample = sampleSpinPlan(plan, elapsed);
    phases.add(sample.phase);
    assert.ok(sample.progress >= 0 && sample.progress <= 1);
    assert.ok(Number.isFinite(sample.rotation));
    assert.ok(Number.isFinite(sample.speed));

    if (sample.phase === 'launch' || sample.phase === 'cruise' || sample.phase === 'brake') {
      assert.ok(sample.rotation >= previousMainRotation - 1e-12);
      assert.ok(sample.rotation <= plan.mainTargetRotation + 1e-12);
      assert.ok(sample.speed >= -1e-12);
      previousMainRotation = sample.rotation;
    }

    if (sample.phase === 'false-finish') {
      assert.equal(sample.rotation, plan.mainTargetRotation);
      assert.equal(sample.speed, 0);
    }

    if (sample.phase === 'settle') {
      assert.ok(sample.rotation <= previousSettleRotation + 1e-12);
      assert.ok(sample.rotation >= plan.finalRotation - 1e-12);
      previousSettleRotation = sample.rotation;
    }
  }

  assert.deepEqual(
    [...phases],
    ['anticipation', 'launch', 'cruise', 'brake', 'false-finish', 'settle'],
  );
});

test('reduced motion keeps timing but removes anticipation and recoil', () => {
  const plan = makePlan({
    recoil: true,
    falseFinish: true,
    reducedMotion: true,
  });

  assert.equal(plan.durationMs, 5_000);
  assert.equal(plan.anticipationAngle, 0);
  assert.equal(plan.recoil, false);
  assert.equal(plan.recoilDelta, 0);
  assert.equal(
    sampleSpinPlan(plan, plan.phaseTimes.anticipationEndMs / 2).rotation,
    plan.startRotation,
  );
  assert.equal(sampleSpinPlan(plan, plan.durationMs).rotation, plan.finalRotation);
});

test('a one-slice wheel cannot show a false neighbouring finish', () => {
  const plan = makePlan({
    sliceAngle: Math.PI * 2,
    recoil: true,
    falseFinish: true,
    falseFinishDepthRatio: 0.16,
  });

  assert.equal(plan.falseFinish, false);
  assert.equal(plan.recoil, false);
  assert.equal(plan.recoilDelta, 0);
  assert.equal(plan.mainTargetRotation, plan.finalRotation);
});

test('a normal long spin does not sit still for seconds before completion', () => {
  const plan = makePlan({ durationMs: 30_000, recoil: false });
  const settleDuration = plan.durationMs - plan.phaseTimes.brakeEndMs;

  assert.ok(settleDuration >= 120);
  assert.ok(settleDuration <= 220);
  assert.ok(
    sampleSpinPlan(plan, plan.phaseTimes.brakeEndMs - 500).rotation
      < plan.finalRotation,
  );
  assert.equal(
    sampleSpinPlan(plan, plan.phaseTimes.brakeEndMs).rotation,
    plan.finalRotation,
  );
});
