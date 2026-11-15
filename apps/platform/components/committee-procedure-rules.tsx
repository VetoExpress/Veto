"use client"

import { useId } from "react"
import { usePlatformTranslations } from "@/components/i18n-provider"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  ProcedureRulesInput,
  ProcedureThresholdInput,
} from "@/lib/conference-client"

interface CommitteeProcedureRulesProps {
  value: ProcedureRulesInput
  disabled?: boolean
  onChange: (value: ProcedureRulesInput) => void
}

const inputClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function RuleSelect<Value extends string>({
  label,
  value,
  items,
  disabled,
  onValueChange,
}: {
  label: string
  value: Value
  items: { value: Value; label: string }[]
  disabled: boolean
  onValueChange: (value: Value) => void
}) {
  const id = useId()

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        items={items}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next)
        }}
      >
        <SelectTrigger id={id} className="h-9 w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function thresholdValue(value: ProcedureThresholdInput): string {
  return value.type === "fixed" ? "fixed" : value.type
}

function thresholdFromValue(value: string): ProcedureThresholdInput {
  return value === "fixed"
    ? { type: "fixed", value: 1 }
    : { type: value as "simple_majority" | "two_thirds" }
}

export function CommitteeProcedureRules({
  value,
  disabled = false,
  onChange,
}: CommitteeProcedureRulesProps) {
  const { t } = usePlatformTranslations()

  function patch(patch: Partial<ProcedureRulesInput>): void {
    onChange({ ...value, ...patch })
  }

  function patchProcedural(
    patchValue: Partial<ProcedureRulesInput["proceduralVote"]>
  ): void {
    patch({ proceduralVote: { ...value.proceduralVote, ...patchValue } })
  }

  function patchQuorum(
    patchValue: Partial<ProcedureRulesInput["quorum"]>
  ): void {
    patch({ quorum: { ...value.quorum, ...patchValue } })
  }

  function patchDocument(
    patchValue: Partial<ProcedureRulesInput["documentVote"]>
  ): void {
    patch({ documentVote: { ...value.documentVote, ...patchValue } })
  }

  return (
    <div className="grid gap-5 md:grid-cols-3">
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("platform_rules_quorum")}
        </legend>
        <RuleSelect
          label={t("platform_rules_denominator")}
          disabled={disabled}
          value={value.quorum.denominator}
          items={[
            {
              value: "all_participants",
              label: t("platform_rules_all_participants"),
            },
            {
              value: "voting_eligible",
              label: t("platform_rules_voting_eligible"),
            },
          ]}
          onValueChange={(denominator) => patchQuorum({ denominator })}
        />
        <RuleSelect
          label={t("platform_rules_threshold")}
          disabled={disabled}
          value={thresholdValue(value.quorum.threshold)}
          items={[
            {
              value: "simple_majority",
              label: t("platform_rules_simple_majority"),
            },
            { value: "two_thirds", label: t("platform_rules_two_thirds") },
            { value: "fixed", label: t("platform_rules_fixed") },
          ]}
          onValueChange={(next) =>
            patchQuorum({ threshold: thresholdFromValue(next) })
          }
        />
        {value.quorum.threshold.type === "fixed" ? (
          <input
            className={inputClassName}
            type="number"
            min={1}
            step={1}
            value={value.quorum.threshold.value}
            disabled={disabled}
            aria-label={t("platform_rules_fixed_value")}
            onChange={(event) =>
              patchQuorum({
                threshold: {
                  type: "fixed",
                  value: event.currentTarget.valueAsNumber,
                },
              })
            }
          />
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("platform_rules_procedural")}
        </legend>
        <RuleSelect
          label={t("platform_rules_denominator")}
          disabled={disabled}
          value={value.proceduralVote.denominator}
          items={[
            {
              value: "present_participants",
              label: t("platform_rules_present_participants"),
            },
            {
              value: "present_voting_eligible",
              label: t("platform_rules_present_voting_eligible"),
            },
          ]}
          onValueChange={(denominator) => patchProcedural({ denominator })}
        />
        <RuleSelect
          label={t("platform_rules_threshold")}
          disabled={disabled}
          value={
            value.proceduralVote.threshold
              ? thresholdValue(value.proceduralVote.threshold)
              : "default"
          }
          items={[
            { value: "default", label: t("platform_rules_motion_defaults") },
            {
              value: "simple_majority",
              label: t("platform_rules_simple_majority"),
            },
            { value: "two_thirds", label: t("platform_rules_two_thirds") },
            { value: "fixed", label: t("platform_rules_fixed") },
          ]}
          onValueChange={(next) =>
            patchProcedural({
              threshold: next === "default" ? null : thresholdFromValue(next),
            })
          }
        />
        {value.proceduralVote.threshold?.type === "fixed" ? (
          <input
            className={inputClassName}
            type="number"
            min={1}
            step={1}
            value={value.proceduralVote.threshold.value}
            disabled={disabled}
            aria-label={t("platform_rules_fixed_value")}
            onChange={(event) =>
              patchProcedural({
                threshold: {
                  type: "fixed",
                  value: event.currentTarget.valueAsNumber,
                },
              })
            }
          />
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("platform_rules_document")}
        </legend>
        <RuleSelect
          label={t("platform_rules_denominator")}
          disabled={disabled}
          value={value.documentVote.denominator}
          items={[
            {
              value: "present_voting_eligible",
              label: t("platform_rules_present_voting_eligible"),
            },
            { value: "yes_no", label: t("platform_rules_yes_no") },
          ]}
          onValueChange={(denominator) => patchDocument({ denominator })}
        />
        <RuleSelect
          label={t("platform_rules_threshold")}
          disabled={disabled}
          value={value.documentVote.ratio}
          items={[
            {
              value: "simple_majority",
              label: t("platform_rules_simple_majority"),
            },
            { value: "two_thirds", label: t("platform_rules_two_thirds") },
          ]}
          onValueChange={(ratio) => patchDocument({ ratio })}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {t("platform_rules_veto_from_seats")}
        </p>
      </fieldset>
    </div>
  )
}
