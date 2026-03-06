<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    type?: 'info' | 'warning' | 'danger' | 'tip'
    title?: string
  }>(),
  {
    type: 'info',
    title: ''
  }
)

const titleText = computed(() => {
  if (props.title) return props.title
  return props.type.charAt(0).toUpperCase() + props.type.slice(1)
})
</script>

<template>
  <div class="callout" :class="`callout-${props.type}`">
    <div class="callout-title">{{ titleText }}</div>
    <div><slot /></div>
  </div>
</template>
