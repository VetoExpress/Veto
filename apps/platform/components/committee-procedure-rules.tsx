"use client"

import { usePlatformTranslations } from "@/components/i18n-provider"
import type {
  ProcedureRulesInput,
  ProcedureThresholdInput,
} from "@/lib/conference-client"

interface CommitteeProcedureRulesProps {
  value: ProcedureRulesInput
  disabled?: boolean
  onChange: (value: ProcedureRulesInput) => void
}

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

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
        <label className="flex flex-col gap-1.5 text-sm">
          {t("platform_rules_denominator")}
          <select
            className={selectClassName}
            disabled={disabled}
            value={value.quorum.denominator}
            onChange={(event) =>
              patchQuorum({
                denominator: event.target
                  .value as ProcedureRulesInput["quorum"]["denominator"],
              })
            }
          >
            <option value="all_participants">
              {t("platform_rules_all_participants")}
            </option>
            <option value="voting_eligible">
              {t("platform_rules_voting_eligible")}
            </option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t("platform_rules_threshold")}
          <select
            className={selectClassName}
            disabled={disabled}
            value={thresholdValue(value.quorum.threshold)}
            onChange={(event) =>
              patchQuorum({ threshold: thresholdFromValue(event.target.value) })
            }
          >
            <option value="simple_majority">
              {t("platform_rules_simple_majority")}
            </option>
            <option value="two_thirds">{t("platform_rules_two_thirds")}</option>
            <option value="fixed">{t("platform_rules_fixed")}</option>
          </select>
        </label>
        {value.quorum.threshold.type === "fixed" ? (
          <input
            className={selectClassName}
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
        <label className="flex flex-col gap-1.5 text-sm">
          {t("platform_rules_denominator")}
          <select
            className={selectClassName}
            disabled={disabled}
            value={value.proceduralVote.denominator}
            onChange={(event) =>
              patchProcedural({
                denominator: event.target
                  .value as ProcedureRulesInput["proceduralVote"]["denominator"],
              })
            }
          >
            <option value="present_participants">
              {t("platform_rules_present_participants")}
            </option>
            <option value="present_voting_eligible">
              {t("platform_rules_present_voting_eligible")}
            </option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t("platform_rules_threshold")}
          <select
            className={selectClassName}
            disabled={disabled}
            value={
              value.proceduralVote.threshold
                ? thresholdValue(value.proceduralVote.threshold)
                : "default"
            }
            onChange={(event) =>
              patchProcedural({
                threshold:
                  event.target.value === "default"
                    ? null
                    : thresholdFromValue(event.target.value),
              })
            }
          >
            <option value="default">
              {t("platform_rules_motion_defaults")}
            </option>
            <option value="simple_majority">
              {t("platform_rules_simple_majority")}
            </option>
            <option value="two_thirds">{t("platform_rules_two_thirds")}</option>
            <option value="fixed">{t("platform_rules_fixed")}</option>
          </select>
        </label>
        {value.proceduralVote.threshold?.type === "fixed" ? (
          <input
            className={selectClassName}
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
        <label className="flex flex-col gap-1.5 text-sm">
          {t("platform_rules_denominator")}
          <select
            className={selectClassName}
            disabled={disabled}
            value={value.documentVote.denominator}
            onChange={(event) =>
              patchDocument({
                denominator: event.target
                  .value as ProcedureRulesInput["documentVote"]["denominator"],
              })
            }
          >
            <option value="present_voting_eligible">
              {t("platform_rules_present_voting_eligible")}
            </option>
            <option value="yes_no">{t("platform_rules_yes_no")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t("platform_rules_threshold")}
          <select
            className={selectClassName}
            disabled={disabled}
            value={value.documentVote.ratio}
            onChange={(event) =>
              patchDocument({
                ratio: event.target
                  .value as ProcedureRulesInput["documentVote"]["ratio"],
              })
            }
          >
            <option value="simple_majority">
              {t("platform_rules_simple_majority")}
            </option>
            <option value="two_thirds">{t("platform_rules_two_thirds")}</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("platform_rules_veto_from_seats")}
        </p>
      </fieldset>
    </div>
  )
}
