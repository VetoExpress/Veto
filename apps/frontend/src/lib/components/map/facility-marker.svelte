<script lang="ts">
  import { t } from '$lib/i18n'
  import type { Facility, FacilityType } from '$lib/classes/types/battle'
  import { getMilSymbolSVG } from '$lib/classes/utils/milsymbol-utils'

  let { facility, onclick }: { facility: Facility; onclick?: () => void } = $props()

  const TYPE_LABELS = $derived<Record<FacilityType, string>>({
    fortress: t('components_fortress'),
    trench_network: t('components_trench'),
    supply_depot: t('components_supply_depot'),
    railway_hub: t('components_railway_hub'),
    airfield: t('components_airfield'),
    artillery_position: t('components_artillery_position'),
    command_post: t('components_command_post'),
    hospital: t('components_hospital')
  })

  const FACILITY_CODES: Record<FacilityType, string> = {
    fortress: 'GUCFS--',
    trench_network: 'GUCE---',
    supply_depot: 'GUCS---',
    railway_hub: 'GURRH---',
    airfield: 'AA------',
    artillery_position: 'GCFS---',
    command_post: 'GUGPHQ--',
    hospital: 'GUH-----'
  }

  const label = $derived(TYPE_LABELS[facility.type] ?? facility.type)
  const natoCode = $derived(FACILITY_CODES[facility.type] ?? 'GU------')
  const symSvg = $derived(getMilSymbolSVG(natoCode, 'neutral', 20, undefined))
</script>

<button type="button" class="facility-marker" title={label} onclick={() => onclick?.()}>
  <div class="facility-marker-icon">{@html symSvg}</div>
  <span>{facility.name}</span>
</button>
