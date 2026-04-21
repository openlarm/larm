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
