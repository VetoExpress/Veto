import { t } from '$lib/i18n'
import {
  Building2,
  Check,
  ClipboardList,
  Compass,
  ExternalLink,
  Users
} from '@lucide/svelte'

export type WizardStepId = 'mode' | 'event' | 'meeting' | 'seats' | 'review' | 'platform'

/** 创建向导各步的元数据：标题与图标（数组顺序即步骤顺序） */
export const wizardSteps = [
  { id: 'mode', get title() { return t('platform_creation_mode') }, icon: Compass },
  { id: 'event', get title() { return t('platform_conference_details') }, icon: Building2 },
  { id: 'meeting', get title() { return t('platform_committee_planning') }, icon: ClipboardList },
  { id: 'seats', get title() { return t('platform_seat_assignment') }, icon: Users },
  { id: 'review', get title() { return t('platform_confirm_creation') }, icon: Check },
  { id: 'platform', get title() { return t('platform_enter_platform') }, icon: ExternalLink }
] as const

export type WizardStep = (typeof wizardSteps)[number]

export function getWizardSteps(mode: 'conference' | 'singleton' | null): WizardStep[] {
  if (mode === 'conference')
    return wizardSteps.filter((step) => step.id === 'mode' || step.id === 'platform')
  return wizardSteps.filter((step) => step.id !== 'platform')
}
