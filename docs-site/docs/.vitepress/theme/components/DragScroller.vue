<script setup lang="ts">
import { ref } from 'vue'

const root = ref<HTMLElement | null>(null)
let pointerId: number | null = null
let startX = 0
let startScrollLeft = 0

function onPointerDown(event: PointerEvent) {
  if (!root.value) return
  pointerId = event.pointerId
  startX = event.clientX
  startScrollLeft = root.value.scrollLeft
  root.value.classList.add('is-dragging')
  root.value.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!root.value || pointerId !== event.pointerId) return
  const delta = event.clientX - startX
  root.value.scrollLeft = startScrollLeft - delta
}

function stopDragging(event?: PointerEvent) {
  if (!root.value) return
  if (event && pointerId !== event.pointerId) return
  if (event && root.value.hasPointerCapture(event.pointerId)) {
    root.value.releasePointerCapture(event.pointerId)
  }
  root.value.classList.remove('is-dragging')
  pointerId = null
}
</script>

<template>
  <div
    ref="root"
    class="drag-scroller"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="stopDragging"
    @pointercancel="stopDragging"
    @pointerleave="stopDragging"
  >
    <div class="drag-scroller-track">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.drag-scroller {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  cursor: grab;
  user-select: none;
}

.drag-scroller::-webkit-scrollbar {
  display: none;
}

.drag-scroller.is-dragging {
  cursor: grabbing;
}

.drag-scroller-track {
  width: max-content;
  min-width: 100%;
}
</style>
