<template>
  <div class="animated-flow" aria-label="Core operating loop diagram">
    <svg viewBox="0 0 960 324" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="flowLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(24,226,153,0.12)" />
          <stop offset="50%" stop-color="rgba(24,226,153,0.9)" />
          <stop offset="100%" stop-color="rgba(24,226,153,0.12)" />
        </linearGradient>
        <linearGradient id="flowPanel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(11,28,21,0.98)" />
          <stop offset="100%" stop-color="rgba(8,18,15,0.98)" />
        </linearGradient>
        <filter id="flowGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="feedbackArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 L8 4 L0 8" fill="none" stroke="rgba(97,255,208,0.88)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </marker>
        <path id="mainFlowPath" d="M112 129 H848" />
        <path id="feedbackPath" d="M632 196 V218 Q632 230 620 230 H500 Q488 230 488 218 V198" />
      </defs>

      <rect class="flow-frame" x="1" y="1" width="958" height="322" rx="20" />

      <path class="flow-link base" d="M186 129 H224" />
      <path class="flow-link base" d="M372 129 H440" />
      <path class="flow-link base" d="M552 129 H568" />
      <path class="flow-link base" d="M680 129 H774" />

      <path class="flow-link animated" d="M186 129 H224" />
      <path class="flow-link animated" d="M372 129 H440" />
      <path class="flow-link animated" d="M552 129 H568" />
      <path class="flow-link animated" d="M680 129 H774" />

      <g class="flow-group">
        <rect class="flow-node stage stage-1" x="38" y="92" width="148" height="74" rx="16" />
        <text class="flow-text two-line stage stage-1" x="112" y="126">
          <tspan x="112" dy="0">Memory</tspan>
          <tspan x="112" dy="24">Write</tspan>
        </text>
      </g>

      <g class="flow-group">
        <rect class="flow-node stage stage-2" x="224" y="92" width="148" height="74" rx="16" />
        <text class="flow-text two-line stage stage-2" x="298" y="126">
          <tspan x="298" dy="0">Context</tspan>
          <tspan x="298" dy="24">Assemble</tspan>
        </text>
      </g>

      <g class="flow-group focus">
        <rect class="flow-focus" x="405" y="48" width="308" height="198" rx="20" />
        <rect class="flow-label-pill" x="430" y="16" width="96" height="22" rx="11" />
        <text class="flow-label" x="478" y="31">Policy loop</text>
        <rect class="flow-node active stage stage-3" x="440" y="92" width="112" height="74" rx="16" />
        <rect class="flow-node active stage stage-4" x="568" y="92" width="112" height="74" rx="16" />
        <text class="flow-text two-line stage stage-3" x="496" y="126">
          <tspan x="496" dy="0">Policy</tspan>
          <tspan x="496" dy="24">Evaluate</tspan>
        </text>
        <text class="flow-text two-line stage stage-4" x="624" y="126">
          <tspan x="624" dy="0">Action</tspan>
          <tspan x="624" dy="24">Run</tspan>
        </text>
        <rect class="flow-feedback-pill" x="492" y="238" width="136" height="18" rx="9" />
        <text class="flow-feedback-label" x="560" y="251">tools/feedback</text>

        <path class="flow-loop-base" d="M632 196 V218 Q632 230 620 230 H500 Q488 230 488 218 V198" />
        <path class="flow-loop-glow" d="M632 196 V218 Q632 230 620 230 H500 Q488 230 488 218 V198" />
        <path class="flow-loop" d="M632 196 V218 Q632 230 620 230 H500 Q488 230 488 218 V198" marker-end="url(#feedbackArrow)" />
      </g>

      <g class="flow-group">
        <rect class="flow-node replay stage stage-5" x="774" y="92" width="148" height="74" rx="16" />
        <text class="flow-text two-line replay-text stage stage-5" x="848" y="126">
          <tspan x="848" dy="0">Replay</tspan>
          <tspan x="848" dy="24">Execution</tspan>
        </text>
      </g>

      <circle class="flow-runner" r="5.5">
        <animateMotion
          dur="7.2s"
          repeatCount="indefinite"
          rotate="auto"
          keyPoints="0;1"
          keyTimes="0;1"
          calcMode="linear"
        >
          <mpath href="#mainFlowPath" />
        </animateMotion>
      </circle>

      <circle class="flow-feedback-runner" r="4">
        <animateMotion
          dur="5.2s"
          repeatCount="indefinite"
          rotate="auto"
          begin="1.3s"
          keyPoints="0;1"
          keyTimes="0;1"
          calcMode="linear"
        >
          <mpath href="#feedbackPath" />
        </animateMotion>
      </circle>
    </svg>
  </div>
</template>

<style scoped>
.animated-flow {
  position: relative;
  margin: 0 0 8px;
  border: 1px solid rgba(24, 226, 153, 0.14);
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(24, 226, 153, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(24, 226, 153, 0.05), rgba(24, 226, 153, 0.01)),
    var(--vp-c-bg-alt);
  overflow: hidden;
}

.animated-flow::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(24, 226, 153, 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(24, 226, 153, 0.025) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.7), transparent 92%);
  pointer-events: none;
}

svg {
  display: block;
  width: 100%;
  height: auto;
}

.flow-frame {
  fill: none;
  stroke: rgba(24, 226, 153, 0.08);
}

.flow-node {
  fill: rgba(12, 18, 16, 0.96);
  stroke: rgba(24, 226, 153, 0.18);
  stroke-width: 1.5;
}

:global(.dark) .flow-node {
  fill: rgba(12, 18, 16, 0.96);
}

.flow-node.active {
  fill: url(#flowPanel);
  stroke: rgba(24, 226, 153, 0.34);
}

.flow-node.replay {
  fill: rgba(9, 28, 20, 0.95);
  stroke: rgba(24, 226, 153, 0.3);
}

.flow-focus {
  fill: none;
  stroke: rgba(24, 226, 153, 0.56);
  stroke-width: 2;
  stroke-dasharray: 8 8;
}

.flow-label-pill {
  fill: rgba(9, 18, 16, 0.92);
  stroke: rgba(24, 226, 153, 0.22);
  stroke-width: 1;
}

.flow-label {
  fill: var(--vp-c-text-3);
  font-size: 12px;
  font-weight: 700;
  text-anchor: middle;
}

.flow-feedback-label {
  fill: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 700;
  text-anchor: middle;
  letter-spacing: 0.06em;
}

.flow-feedback-pill {
  fill: rgba(9, 18, 16, 0.94);
}

.flow-text {
  fill: var(--vp-c-text-1);
  font-size: 22px;
  font-weight: 600;
  text-anchor: middle;
  dominant-baseline: middle;
}

.flow-text.two-line tspan:last-child {
  font-size: 18px;
  fill: var(--vp-c-text-2);
}

.replay-text {
  fill: var(--vp-c-brand-1);
}

.replay-text.two-line tspan:last-child {
  fill: rgba(24, 226, 153, 0.78);
}

.flow-link {
  fill: none;
  stroke-linecap: round;
}

.flow-link.base {
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 2;
}

.flow-link.animated {
  stroke: url(#flowLine);
  stroke-width: 2;
  stroke-dasharray: 10 16;
  animation: flow-dash 5.8s linear infinite;
}

.flow-loop {
  fill: none;
  stroke: rgba(97, 255, 208, 0.88);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 10 8;
  animation: flow-dash 6.4s linear infinite;
}

.flow-loop-base {
  fill: none;
  stroke: rgba(97, 255, 208, 0.24);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.flow-loop-glow {
  fill: none;
  stroke: rgba(97, 255, 208, 0.16);
  stroke-width: 10;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: url(#flowGlow);
}

.flow-runner,
.flow-feedback-runner {
  fill: #61ffd0;
  filter: url(#flowGlow);
}

.flow-feedback-runner {
  fill: rgba(97, 255, 208, 0.8);
}

.stage {
  opacity: 0;
  animation: stage-in 820ms cubic-bezier(0.2, 0.9, 0.24, 1) forwards;
}

.stage-1 {
  animation-delay: 0.05s;
}

.stage-2 {
  animation-delay: 0.16s;
}

.stage-3 {
  animation-delay: 0.28s;
}

.stage-4 {
  animation-delay: 0.4s;
}

.stage-5 {
  animation-delay: 0.56s;
}

@keyframes flow-dash {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -52;
  }
}

@keyframes stage-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .flow-text {
    font-size: 16px;
  }

  .flow-text.two-line tspan:last-child {
    font-size: 13px;
  }

  .flow-label {
    font-size: 11px;
  }

  .flow-feedback-label {
    font-size: 9px;
  }
}
</style>
