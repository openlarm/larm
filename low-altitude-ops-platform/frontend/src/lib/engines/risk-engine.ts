import type { WeatherType, RiskLevel, RiskResult, Decision } from "@/lib/types"

type MatrixValue = "normal" | "conditional" | "not_applicable"

const WX_R_MATRIX: Record<WeatherType, Record<RiskLevel, MatrixValue>> = {
  W0: { R0: "normal",         R1: "normal",         R2: "conditional",  R3: "not_applicable", R4: "not_applicable" },
  W1: { R0: "not_applicable", R1: "normal",         R2: "conditional",  R3: "conditional",    R4: "not_applicable" },
  W2: { R0: "not_applicable", R1: "conditional",    R2: "conditional",  R3: "conditional",    R4: "not_applicable" },
  W3: { R0: "not_applicable", R1: "not_applicable", R2: "conditional",  R3: "conditional",    R4: "not_applicable" },
  W4: { R0: "not_applicable", R1: "conditional",    R2: "conditional",  R3: "conditional",    R4: "not_applicable" },
  W5: { R0: "not_applicable", R1: "not_applicable", R2: "conditional",  R3: "conditional",    R4: "not_applicable" },
}

interface DecisionRule {
  decision: Decision
  requires_approval: boolean
  controls: string[]
}

const DECISION_RULES: Record<string, DecisionRule> = {
  "W0-R0": { decision: "GO",          requires_approval: false, controls: ["正常流程"] },
  "W0-R1": { decision: "GO",          requires_approval: false, controls: ["風速監控"] },
  "W1-R1": { decision: "GO",          requires_approval: false, controls: ["增加觀察手"] },
  "W1-R2": { decision: "CONDITIONAL", requires_approval: true,  controls: ["縮短飛行時段", "增加觀察手"] },
  "W2-R1": { decision: "CONDITIONAL", requires_approval: true,  controls: ["視雨帶移動情況施工"] },
  "W2-R2": { decision: "CONDITIONAL", requires_approval: true,  controls: ["分段作業", "即時監控"] },
  "W3-R2": { decision: "CONDITIONAL", requires_approval: true,  controls: ["地面防滑措施", "縮短時段"] },
  "W4-R2": { decision: "CONDITIONAL", requires_approval: true,  controls: ["即時雷達監控", "午後停飛"] },
  "W5-R2": { decision: "CONDITIONAL", requires_approval: true,  controls: ["主管簽核", "縮短飛行時段"] },
}

function getInternalGrade(risk: RiskLevel): "A" | "B" | "C" | "D" {
  return { R0: "A", R1: "B", R2: "C", R3: "D", R4: "D" }[risk] as "A" | "B" | "C" | "D"
}

export function evaluateRisk(
  weatherType: WeatherType,
  riskLevel: RiskLevel,
  rulesetVersion = "v1.0"
): RiskResult {
  const key = `${weatherType}-${riskLevel}`
  const rule = DECISION_RULES[key]

  let decision: Decision = "NO_GO"
  let requires_approval = false
  let controls: string[] = []

  if (riskLevel === "R4") {
    decision = "NO_GO"
    controls = ["禁飛，任務不可生成"]
  } else if (riskLevel === "R3") {
    decision = "NO_GO"
    requires_approval = true
    controls = ["原則不排，可申請例外審核"]
  } else if (rule) {
    decision = rule.decision
    requires_approval = rule.requires_approval
    controls = rule.controls
  } else {
    const matrix = WX_R_MATRIX[weatherType][riskLevel]
    if (matrix === "normal") decision = "GO"
    else if (matrix === "conditional") {
      decision = "CONDITIONAL"
      requires_approval = true
      controls = ["請聯繫作業主管確認條件"]
    }
  }

  return {
    weather_type: weatherType,
    risk_level: riskLevel,
    internal_grade: getInternalGrade(riskLevel),
    decision,
    requires_approval,
    controls,
    ruleset_version: rulesetVersion,
    evaluated_at: new Date().toISOString(),
  }
}
