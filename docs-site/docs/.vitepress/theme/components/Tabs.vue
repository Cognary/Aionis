<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'

type TabKey = 'ts' | 'python' | 'curl'

const slots = useSlots()
const order: TabKey[] = ['ts', 'python', 'curl']
const labels: Record<TabKey, string> = {
  ts: 'TS',
  python: 'Python',
  curl: 'Curl'
}

const availableTabs = computed(() => order.filter((key) => Boolean(slots[key])))
const active = ref<TabKey>('ts')

if (availableTabs.value.length > 0 && !availableTabs.value.includes(active.value)) {
  active.value = availableTabs.value[0]
}

function setTab(key: TabKey) {
  active.value = key
}
</script>

<template>
  <div class="tabs">
    <div class="tabs-head">
      <button
        v-for="key in availableTabs"
        :key="key"
        class="tabs-btn"
        :class="{ active: active === key }"
        type="button"
        @click="setTab(key)"
      >
        {{ labels[key] }}
      </button>
    </div>

    <div class="tabs-panel">
      <slot v-if="active === 'ts'" name="ts" />
      <slot v-else-if="active === 'python'" name="python" />
      <slot v-else name="curl" />
    </div>
  </div>
</template>
