<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  method: string
  path: string
}>()

const methodClass = computed(() => props.method.toLowerCase())
</script>

<template>
  <div class="endpoint">
    <span class="endpoint-method" :class="methodClass">{{ props.method }}</span>
    <code class="endpoint-path">{{ props.path }}</code>
  </div>
</template>
