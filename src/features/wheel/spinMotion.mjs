const MAX_NATURAL_RECOIL_RADIANS = 4 * Math.PI / 180;
const FULL_CIRCLE = Math.PI * 2;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function smootherStep(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function smootherStepDerivative(value) {
  const t = clamp(value, 0, 1);
  return 30 * t * t * (t - 1) * (t - 1);
}

// Integral from 0 to value of smootherStep(t) dt. The value at 1 is 1 / 2.
function smootherStepIntegral(value) {
  const t = clamp(value, 0, 1);
  const t2 = t * t;
  const t4 = t2 * t2;
  return t4 * (t2 - 3 * t + 2.5);
}

/**
 * Builds an immutable description of one wheel spin.
 *
 * The landing point and recoil distance are independent. This lets a small
 * physical rollback stay inside a slice most of the time and cross a boundary
 * only when the randomly chosen landing point happens to be close to it.
 */
export function createSpinPlan({
  startRotation,
  finalRotation,
  durationMs,
  sliceAngle,
  randomOffset = 0.5,
  recoil = false,
  recoilRatio = 0,
  reducedMotion = false,
}) {
  const start = finiteNumber(startRotation, 'startRotation');
  const final = finiteNumber(finalRotation, 'finalRotation');
  const duration = finiteNumber(durationMs, 'durationMs');
  const slice = Math.abs(finiteNumber(sliceAngle, 'sliceAngle'));

  if (duration <= 0) {
    throw new RangeError('durationMs must be greater than zero');
  }
  if (slice <= 0) {
    throw new RangeError('sliceAngle must be greater than zero');
  }

  const offset = clamp(finiteNumber(randomOffset, 'randomOffset'), 0, 1);
  const requestedRecoilRatio = Math.max(0, finiteNumber(recoilRatio, 'recoilRatio'));
  const direction = Math.sign(final - start) || 1;
  const maximumRecoil = Math.min(
    MAX_NATURAL_RECOIL_RADIANS,
    Math.max(0, slice - Number.EPSILON),
  );
  const recoilDelta = recoil && !reducedMotion
    ? Math.min(requestedRecoilRatio * slice, maximumRecoil)
    : 0;
  const mainTargetRotation = final + direction * recoilDelta;
  const recoilDegrees = recoilDelta * 180 / Math.PI;
  const crossesBoundary = Boolean(
    recoilDelta > offset * slice
    && slice < FULL_CIRCLE - Number.EPSILON,
  );

  const anticipationDurationMs = reducedMotion
    ? Math.min(120, duration * 0.04)
    : Math.min(clamp(duration * 0.06, 220, 340), duration * 0.09);
  const launchDurationMs = Math.min(
    clamp(duration * 0.12, 420, 650),
    duration * 0.18,
  );
  const rollbackDurationMs = recoilDelta > 0
    ? Math.min(
      clamp(850 + 75 * (recoilDegrees - 2), 850, 1000),
      duration * 0.22,
    )
    : Math.min(clamp(duration * 0.035, 120, 220), duration * 0.06);
  const settleDurationMs = rollbackDurationMs;
  const mainDurationMs = Math.max(
    1,
    duration - anticipationDurationMs - launchDurationMs - settleDurationMs,
  );
  const cruiseDurationMs = mainDurationMs * 0.46;
  const brakeDurationMs = mainDurationMs - cruiseDurationMs;
  const anticipationEndMs = anticipationDurationMs;
  const launchEndMs = anticipationEndMs + launchDurationMs;
  const cruiseEndMs = launchEndMs + cruiseDurationMs;
  const brakeEndMs = Math.min(duration, cruiseEndMs + brakeDurationMs);
  const velocityAreaMs = (
    launchDurationMs * 0.5
    + cruiseDurationMs
    + brakeDurationMs * 0.5
  );

  return Object.freeze({
    startRotation: start,
    finalRotation: final,
    durationMs: duration,
    sliceAngle: slice,
    randomOffset: offset,
    reducedMotion: Boolean(reducedMotion),
    requestedRecoil: Boolean(recoil),
    recoil: recoilDelta > 0,
    recoilRatio: requestedRecoilRatio,
    recoilDelta,
    recoilDegrees,
    maximumRecoil,
    crossesBoundary,
    rollbackDurationMs,
    direction,
    mainTargetRotation,
    anticipationAngle: reducedMotion ? 0 : Math.min(slice * 0.16, 0.14),
    phaseTimes: Object.freeze({
      anticipationEndMs,
      launchEndMs,
      cruiseEndMs,
      brakeEndMs,
      endMs: duration,
    }),
    velocityAreaMs,
  });
}

function sampleAnticipation(plan, elapsedMs) {
  const duration = plan.phaseTimes.anticipationEndMs;
  const phaseProgress = duration > 0 ? elapsedMs / duration : 1;
  const wave = Math.sin(Math.PI * phaseProgress);
  const rotation = plan.startRotation
    - plan.direction * plan.anticipationAngle * wave * wave;
  const speed = duration > 0
    ? -plan.direction
      * plan.anticipationAngle
      * Math.PI
      * Math.sin(2 * Math.PI * phaseProgress)
      / duration
    : 0;

  return { rotation, speed };
}

function sampleMainTravel(plan, elapsedMs, phase) {
  const {
    anticipationEndMs,
    launchEndMs,
    cruiseEndMs,
    brakeEndMs,
  } = plan.phaseTimes;
  const launchDuration = launchEndMs - anticipationEndMs;
  const cruiseDuration = cruiseEndMs - launchEndMs;
  const brakeDuration = brakeEndMs - cruiseEndMs;
  let area;
  let velocityEnvelope;

  if (phase === 'launch') {
    const t = (elapsedMs - anticipationEndMs) / launchDuration;
    area = launchDuration * smootherStepIntegral(t);
    velocityEnvelope = smootherStep(t);
  } else if (phase === 'cruise') {
    area = launchDuration * 0.5 + (elapsedMs - launchEndMs);
    velocityEnvelope = 1;
  } else {
    const t = (elapsedMs - cruiseEndMs) / brakeDuration;
    area = (
      launchDuration * 0.5
      + cruiseDuration
      + brakeDuration * (t - smootherStepIntegral(t))
    );
    velocityEnvelope = 1 - smootherStep(t);
  }

  const distance = plan.mainTargetRotation - plan.startRotation;
  return {
    rotation: plan.startRotation + distance * area / plan.velocityAreaMs,
    speed: distance * velocityEnvelope / plan.velocityAreaMs,
  };
}

function sampleSettle(plan, elapsedMs) {
  const startMs = plan.phaseTimes.brakeEndMs;
  const duration = plan.durationMs - startMs;
  const t = duration > 0 ? (elapsedMs - startMs) / duration : 1;
  const distance = plan.finalRotation - plan.mainTargetRotation;

  return {
    rotation: plan.mainTargetRotation + distance * smootherStep(t),
    speed: duration > 0
      ? distance * smootherStepDerivative(t) / duration
      : 0,
  };
}

/**
 * Samples a spin plan at `elapsedMs`.
 * `speed` is the signed angular velocity in radians per millisecond.
 */
export function sampleSpinPlan(plan, elapsedMs) {
  if (!plan || !Number.isFinite(plan.durationMs) || plan.durationMs <= 0) {
    throw new TypeError('plan must be created by createSpinPlan');
  }

  const requestedElapsed = Number(elapsedMs);
  const elapsed = requestedElapsed === Infinity
    ? plan.durationMs
    : clamp(Number.isFinite(requestedElapsed) ? requestedElapsed : 0, 0, plan.durationMs);
  const progress = elapsed / plan.durationMs;

  if (elapsed <= 0) {
    return {
      rotation: plan.startRotation,
      progress: 0,
      phase: 'anticipation',
      speed: 0,
    };
  }

  if (elapsed >= plan.durationMs) {
    return {
      rotation: plan.finalRotation,
      progress: 1,
      phase: 'settle',
      speed: 0,
    };
  }

  let phase;
  let motion;
  if (elapsed < plan.phaseTimes.anticipationEndMs) {
    phase = 'anticipation';
    motion = sampleAnticipation(plan, elapsed);
  } else if (elapsed < plan.phaseTimes.launchEndMs) {
    phase = 'launch';
    motion = sampleMainTravel(plan, elapsed, phase);
  } else if (elapsed < plan.phaseTimes.cruiseEndMs) {
    phase = 'cruise';
    motion = sampleMainTravel(plan, elapsed, phase);
  } else if (elapsed < plan.phaseTimes.brakeEndMs) {
    phase = 'brake';
    motion = sampleMainTravel(plan, elapsed, phase);
  } else {
    phase = 'settle';
    motion = sampleSettle(plan, elapsed);
  }

  return {
    rotation: motion.rotation,
    progress,
    phase,
    speed: motion.speed,
  };
}
