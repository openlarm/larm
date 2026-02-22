"use client"
import { useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle, AlertTriangle, User, Wrench } from "lucide-react"
import { MOCK_TEAMS, MOCK_EQUIPMENT } from "@/lib/mock-data"
import type { Mission, TeamMember, Equipment, QualCheck } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

function checkQual(member: TeamMember, isNight: boolean, floors: number): QualCheck[] {
  const checks: QualCheck[] = []
  const expired = new Date(member.cert_expires) < new Date()
  checks.push({ item: "證照有效期限", result: expired ? "fail" : "pass", reason: expired ? `已於 ${member.cert_expires} 過期` : undefined })
  if (isNight) checks.push({ item: "夜間資格", result: member.night_qualified ? "pass" : "fail", reason: member.night_qualified ? undefined : "不具備夜間作業資格" })
  if (floors > 20) checks.push({ item: "高樓資格", result: member.highrise_qualified ? "pass" : "fail", reason: member.highrise_qualified ? undefined : "不具備高樓作業資格" })
  return checks
}

function checkEquipment(eq: Equipment): QualCheck {
  if (eq.health_status === "block") return { item: eq.name, result: "fail", reason: eq.notes ?? "設備狀態 Block，禁止指派" }
  if (eq.health_status === "warn") return { item: eq.name, result: "warn", reason: eq.notes ?? "設備需注意" }
  return { item: eq.name, result: "pass" }
}

const RESULT_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  fail: <XCircle className="h-4 w-4 text-red-400" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-400" />,
}

export function Step9Assign({ mission, update, next, back }: Props) {
  const [useQualifiedTeam, setUseQualifiedTeam] = useState(true)
  const [useHealthyEquip, setUseHealthyEquip] = useState(true)

  const team = useQualifiedTeam ? MOCK_TEAMS.qualified : MOCK_TEAMS.unqualified
  const equipment = useHealthyEquip ? MOCK_EQUIPMENT.healthy : [...MOCK_EQUIPMENT.healthy, ...MOCK_EQUIPMENT.blocked]

  const isNight = false
  const floors = mission.building?.height_floors ?? 10
  const qualChecks = team.flatMap(m => checkQual(m, isNight, floors))
  const healthChecks = equipment.map(e => checkEquipment(e))

  const hasQualFail = qualChecks.some(c => c.result === "fail")
  const hasHealthBlock = healthChecks.some(c => c.result === "fail")
  const canNext = !hasQualFail && !hasHealthBlock

  const handleNext = () => {
    update({
      assignment: {
        team,
        equipment: useHealthyEquip ? MOCK_EQUIPMENT.healthy : [...MOCK_EQUIPMENT.healthy, ...MOCK_EQUIPMENT.blocked],
        qual_checks: qualChecks,
        health_checks: healthChecks,
      }
    })
    next()
  }

  return (
    <StepShell title="Step 9 — Assign Team & Equipment" subtitle="指派團隊與設備" onBack={back} onNext={handleNext} nextDisabled={!canNext}>

      {/* Scenario toggles */}
      <div className="flex gap-3">
        <button onClick={() => setUseQualifiedTeam(q => !q)}
          className={cn("px-3 py-1.5 text-xs rounded border transition-colors",
            useQualifiedTeam ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300")}>
          團隊：{useQualifiedTeam ? "資格完整 ✓" : "缺少證照 ✗"}（點擊切換）
        </button>
        <button onClick={() => setUseHealthyEquip(h => !h)}
          className={cn("px-3 py-1.5 text-xs rounded border transition-colors",
            useHealthyEquip ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300")}>
          設備：{useHealthyEquip ? "全部健康 ✓" : "含 Block 設備 ⚠"} （點擊切換）
        </button>
      </div>

      {/* Team */}
      <Card className="border-zinc-700 bg-zinc-800/30">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <User className="h-4 w-4" /> 人員配置
          </div>
          {team.map(member => {
            const checks = checkQual(member, isNight, floors)
            const memberFail = checks.some(c => c.result === "fail")
            return (
              <div key={member.id} className={cn("rounded p-3 text-sm border", memberFail ? "border-red-500/30 bg-red-500/5" : "border-zinc-700 bg-zinc-800/40")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{member.name}</span>
                  <span className="text-xs text-zinc-500">{member.role} · {member.cert_number}</span>
                </div>
                <div className="space-y-1">
                  {checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {RESULT_ICON[c.result]}
                      <span className="text-zinc-400">{c.item}</span>
                      {c.reason && <span className="text-red-400 ml-auto">{c.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card className="border-zinc-700 bg-zinc-800/30">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <Wrench className="h-4 w-4" /> 設備清單
          </div>
          {equipment.map(eq => {
            const check = checkEquipment(eq)
            return (
              <div key={eq.id} className={cn("rounded p-3 text-sm border", check.result === "fail" ? "border-red-500/30 bg-red-500/5" : check.result === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-zinc-700 bg-zinc-800/40")}>
                <div className="flex items-center gap-2">
                  {RESULT_ICON[check.result]}
                  <span className="font-medium text-white">{eq.name}</span>
                  <span className="ml-auto text-xs text-zinc-500">{eq.serial}</span>
                </div>
                {check.reason && <p className="text-xs text-amber-400 mt-1 ml-6">{check.reason}</p>}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {(hasQualFail || hasHealthBlock) && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertDescription>存在資格或設備問題，任務無法進入下一步。請切換為合格組合，或觸發例外審核。</AlertDescription>
        </Alert>
      )}
    </StepShell>
  )
}
