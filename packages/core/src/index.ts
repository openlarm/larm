// @openlarm/core barrel.

export const LARM_CORE_VERSION = "0.1.0-alpha.0"

export type {
  // Enum-like unions
  WeatherType,
  RiskLevel,
  Decision,
  Complexity,
  PopulationDensityClass,
  SORAMitigation,
  EquipmentBlockCategory,
  EquipmentWarnCategory,
  RegionExposure,
  CrowdDensity,
  OperatorExperience,
  // Input schemas
  Weather30dInput,
  WeatherTodayInput,
  BuildingSiteInput,
  OperationalContextInput,
  Equipment,
  LARMInput,
  // Output schemas
  RiskResult,
  RiskExplanation,
  WeatherRegimeResult,
  LARMVersions,
  // CWA/JMA cross-validation types (referenced by WeatherTodayInput)
  CWAForecastDay,
  CrossValidationDivergence,
  CWACrossValidation,
  CWAObservation,
  CWACrossValidationMeta,
  JMAForecastDay,
  JMACrossValidation,
} from "./types/index.ts"

export type {
  WCode,
  RegionKey,
  RegimeEntry,
  WindScoreRow,
  RLevelRow,
  WeatherNowWeights,
  BufferCoefficients,
  UIInferThresholds,
  EDRThreshold,
  GScoreConfig,
  EScoreConfig,
  CapeContributionConfig,
  LightningObservationConfig,
  VisibilityObservationConfig,
  RLevelKey,
  WRDecision,
  WeatherRegimeParams,
} from "./params/schema.ts"

export {
  ACTIVE_PARAMS_VERSION,
  PARAM_REGISTRY,
  registerParams,
} from "./params/registry.js"

export {
  mergeParams,
  resolveParams,
} from "./params/merge.js"

export {
  evaluateRisk,
  type EvaluateRiskOptions,
} from "./engines/risk-engine.js"

export {
  inferWCode,
  getWRDecision,
  completionForRL,
  simpleRiskFromW,
  capeToInstabilityContribution,
  lightningForcesThunderRisk,
  lightningTierAdj,
  visibilityForcesNoGo,
  visibilityTierAdj,
} from "./engines/model-helpers.js"
