import { t } from '$lib/i18n'
import {
  Building2,
  Check,
  ClipboardList,
  Compass,
  ShieldCheck,
  Users
} from '@lucide/svelte'

export type WizardStepId = 'mode' | 'event' | 'meeting' | 'roles' | 'seats' | 'review'

/** 创建向导各步的元数据：标题与图标（数组顺序即步骤顺序） */
export const wizardSteps = [
  { id: 'mode', get title() { return t('platform_creation_mode') }, icon: Compass },
  { id: 'event', get title() { return t('platform_conference_details') }, icon: Building2 },
  { id: 'meeting', get title() { return t('platform_committee_planning') }, icon: ClipboardList },
  { id: 'roles', get title() { return t('platform_role_capabilities') }, icon: ShieldCheck },
  { id: 'seats', get title() { return t('platform_seat_assignment') }, icon: Users },
  { id: 'review', get title() { return t('platform_confirm_creation') }, icon: Check }
] as const

export type WizardStep = (typeof wizardSteps)[number]

export function getWizardSteps(mode: 'conference' | 'singleton' | null): WizardStep[] {
  return wizardSteps.filter((step) => mode !== 'singleton' || step.id !== 'roles')
}
