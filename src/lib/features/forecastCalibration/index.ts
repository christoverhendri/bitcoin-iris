import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchForecastCalibration } from './live';
import { mockForecastCalibration } from './mock';
import type { CalibrationArgs, CalibrationData } from './types';

export const getForecastCalibration = defineFeature<CalibrationArgs, CalibrationData>({
  key: 'forecast_calibration',
  source: 'internal_distribution',
  live: fetchForecastCalibration,
  mock: mockForecastCalibration,
  maxAgeSec: MAX_AGE_SEC.calibration,
});

export type {
  CalibrationData,
  CalibrationArgs,
  CoverageRow,
  CoverageVerdict,
  PitBin,
  MethodScore,
} from './types';

export {
  toCalibrationLabels,
  verdictTone,
  verdictSentence,
  uniformityTone,
  shapeSentence,
  fmtPctPoint,
  CALIBRATION_NOTE,
  OUT_OF_SAMPLE_NOTE,
  PIT_NOTE,
  PINBALL_NOTE,
} from './present';
