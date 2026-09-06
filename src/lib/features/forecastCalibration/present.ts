import type { Tone } from '@/lib/theme/tokens';
import type { CalibrationData, CoverageVerdict } from './types';

export const CALIBRATION_NOTE =
  'A forecast cone is only worth what its calibration is worth. For each of ' +
  'roughly a hundred historical origins the model predicts forward without ' +
  'seeing the answer, and the outcome is checked against the bands it claimed. ' +
  'An 80% band should contain the truth about 80% of the time — no more, no less.';

export const OUT_OF_SAMPLE_NOTE =
  'The GARCH parameters and the residual pool are fitted once, on the earliest ' +
  '40% of history, and every scored origin sits after that. No origin’s own ' +
  'future touches the model that predicts it. Each origin does start from the ' +
  'volatility state that was genuinely observable on its day.';

export const PIT_NOTE =
  'PIT asks where each real outcome fell inside the predicted distribution. If ' +
  'the model is honest those positions are spread evenly, and the bars sit flat ' +
  'along the dashed line. Bars piling up at both ends mean the bands are too ' +
  'narrow — reality keeps escaping them. A hump in the middle means they are too ' +
  'wide, which is safe but useless.';

export const PINBALL_NOTE =
  'Pinball loss scores sharpness as well as coverage, so a model cannot win by ' +
  'making its bands uselessly wide. Lower is better.';

const VERDICT_TONE: Record<CoverageVerdict, Tone> = {
  GOOD: 'up',
  NARROW: 'down',
  WIDE: 'amber',
};

export function verdictTone(v: CoverageVerdict): Tone {
  return VERDICT_TONE[v];
}

export function verdictSentence(v: CoverageVerdict, nominal: number): string {
  if (v === 'GOOD') return `holds its ${nominal}% claim`;
  if (v === 'NARROW') return 'overconfident — reality escapes more often than claimed';
  return 'conservative — wider than it needs to be';
}

export function uniformityTone(score: number): Tone {
  if (score >= 80) return 'up';
  if (score >= 60) return 'txt';
  return 'amber';
}

export function shapeSentence(d: CalibrationData): string {
  switch (d.pitShape) {
    case 'U-SHAPED':
      return 'Mass at both ends: the bands are too narrow, and outcomes land outside them more often than they should.';
    case 'HUMPED':
      return 'Mass in the middle: the bands are wider than they need to be, so the forecast is safe but imprecise.';
    case 'SKEWED':
      return 'Mass leaning to one side: the model is systematically off-centre over this test period.';
    default:
      return 'Roughly flat, which is what a calibrated model produces — outcomes are spread evenly across the predicted distribution.';
  }
}

export function fmtPctPoint(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function toCalibrationLabels(d: CalibrationData) {
  const best = [...d.comparison].sort((a, b) => a.pinball - b.pinball)[0];
  return {
    horizon: d.horizonLabel,
    origins: String(d.origins),
    trainDays: d.trainDays.toLocaleString('en-US'),
    testDays: d.testDays.toLocaleString('en-US'),
    uniformity: `${d.pitUniformityScore.toFixed(0)}/100`,
    shape: d.pitShape,
    bestMethod: best ? best.label : '—',
  };
}
