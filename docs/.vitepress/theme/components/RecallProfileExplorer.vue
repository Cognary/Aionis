<script setup lang="ts">
import { computed, ref } from "vue";

type Profile = {
  name: string;
  label: string;
  note: string;
  defaults: {
    limit: number;
    neighborhood_hops: number;
    max_nodes: number;
    max_edges: number;
    ranked_limit: number;
    min_edge_weight: number;
    min_edge_confidence: number;
  };
};

const profiles: Profile[] = [
  {
    name: "legacy",
    label: "legacy",
    note: "Compatibility mode. Broad recall with minimal edge-quality constraints.",
    defaults: {
      limit: 30,
      neighborhood_hops: 2,
      max_nodes: 50,
      max_edges: 100,
      ranked_limit: 100,
      min_edge_weight: 0,
      min_edge_confidence: 0,
    },
  },
  {
    name: "strict_edges",
    label: "strict_edges",
    note: "Default production profile prioritizing precision and stable latency.",
    defaults: {
      limit: 24,
      neighborhood_hops: 2,
      max_nodes: 60,
      max_edges: 80,
      ranked_limit: 140,
      min_edge_weight: 0.2,
      min_edge_confidence: 0.2,
    },
  },
  {
    name: "quality_first",
    label: "quality_first",
    note: "Higher candidate budgets for quality-sensitive, slower recall contexts.",
    defaults: {
      limit: 30,
      neighborhood_hops: 2,
      max_nodes: 80,
      max_edges: 100,
      ranked_limit: 180,
      min_edge_weight: 0.05,
      min_edge_confidence: 0.05,
    },
  },
];

const selectedProfileName = ref<string>("strict_edges");
const selectedProfile = computed<Profile>(() => profiles.find((profile) => profile.name === selectedProfileName.value) ?? profiles[1]);
</script>

<template>
  <section class="aionis-lab-card">
    <header class="aionis-lab-header">
      <h3>Recall Profile Explorer</h3>
      <p>Inspect server default recall profile budgets from runtime defaults.</p>
    </header>

    <div class="aionis-profile-tabs">
      <button
        v-for="profile in profiles"
        :key="profile.name"
        type="button"
        :class="{ active: selectedProfileName === profile.name }"
        @click="selectedProfileName = profile.name"
      >
        {{ profile.label }}
      </button>
    </div>

    <p class="aionis-lab-note">{{ selectedProfile.note }}</p>

    <div class="aionis-metrics-grid">
      <article>
        <span>limit</span>
        <strong>{{ selectedProfile.defaults.limit }}</strong>
      </article>
      <article>
        <span>neighborhood_hops</span>
        <strong>{{ selectedProfile.defaults.neighborhood_hops }}</strong>
      </article>
      <article>
        <span>max_nodes</span>
        <strong>{{ selectedProfile.defaults.max_nodes }}</strong>
      </article>
      <article>
        <span>max_edges</span>
        <strong>{{ selectedProfile.defaults.max_edges }}</strong>
      </article>
      <article>
        <span>ranked_limit</span>
        <strong>{{ selectedProfile.defaults.ranked_limit }}</strong>
      </article>
      <article>
        <span>min_edge_weight</span>
        <strong>{{ selectedProfile.defaults.min_edge_weight }}</strong>
      </article>
      <article>
        <span>min_edge_confidence</span>
        <strong>{{ selectedProfile.defaults.min_edge_confidence }}</strong>
      </article>
    </div>
  </section>
</template>
