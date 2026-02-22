<script setup lang="ts">
import { computed, ref } from "vue";

const memoryItemsPerDay = ref(120000);
const avgTokensPerItem = ref(220);
const compressionRatio = ref(0.4);
const llmPricePer1M = ref(0.6);

const baselineTokens = computed(() => Math.max(0, Math.round(memoryItemsPerDay.value * avgTokensPerItem.value)));
const compressedTokens = computed(() => Math.round(baselineTokens.value * (1 - compressionRatio.value)));
const savedTokens = computed(() => Math.max(0, baselineTokens.value - compressedTokens.value));
const monthlySavedTokens = computed(() => savedTokens.value * 30);
const monthlySavedCost = computed(() => (monthlySavedTokens.value / 1_000_000) * llmPricePer1M.value);

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
</script>

<template>
  <section class="aionis-lab-card">
    <header class="aionis-lab-header">
      <h3>Adaptive Compression Estimator</h3>
      <p>Estimate context-token savings using Aionis budgeted compaction.</p>
    </header>

    <div class="aionis-lab-grid">
      <label>
        <span>Memory items / day</span>
        <input v-model.number="memoryItemsPerDay" type="number" min="1" step="1000" />
      </label>
      <label>
        <span>Avg tokens / item</span>
        <input v-model.number="avgTokensPerItem" type="number" min="1" step="10" />
      </label>
      <label>
        <span>Target compression ratio</span>
        <input v-model.number="compressionRatio" type="range" min="0.1" max="0.95" step="0.01" />
        <strong>{{ Math.round(compressionRatio * 100) }}%</strong>
      </label>
      <label>
        <span>LLM cost / 1M tokens (USD)</span>
        <input v-model.number="llmPricePer1M" type="number" min="0" step="0.05" />
      </label>
    </div>

    <div class="aionis-metrics-grid">
      <article>
        <span>Baseline tokens/day</span>
        <strong>{{ formatNumber(baselineTokens) }}</strong>
      </article>
      <article>
        <span>Compressed tokens/day</span>
        <strong>{{ formatNumber(compressedTokens) }}</strong>
      </article>
      <article>
        <span>Saved tokens/month</span>
        <strong>{{ formatNumber(monthlySavedTokens) }}</strong>
      </article>
      <article>
        <span>Estimated monthly savings</span>
        <strong>${{ monthlySavedCost.toFixed(2) }}</strong>
      </article>
    </div>

    <p class="aionis-lab-note">
      Suggested release gate thresholds are defined in Production Core Gate and Performance Baseline.
    </p>
  </section>
</template>
