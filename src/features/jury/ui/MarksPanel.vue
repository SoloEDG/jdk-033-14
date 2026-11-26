<script setup lang="ts">
import { computed } from 'vue'
import { Check, Flag, MapPin, Waves } from 'lucide-vue-next'
import type { Gate } from '../../../shared/race'

const props = defineProps<{ gates: Gate[]; nextGate: number; penalty: number }>()
const movingNames = computed(() => props.gates
  .filter(gate => Boolean(gate.poseAt ?? gate.motion?.poseAt ?? gate.motion?.velocity))
  .map(gate => gate.id))
</script>

<template>
  <section class="instrument marks" aria-label="绕标裁判">
    <h2><Flag :size="17"/> 绕标裁判 <b data-testid="marks-count">{{ nextGate }} / {{ gates.length }}</b></h2>
    <p v-if="movingNames.length" class="moving-note" data-testid="moving-marks">
      <Waves :size="13"/> {{ movingNames.join('、') }} 标漂移中 · 门线按相遇时刻判读
    </p>
    <ol>
      <li v-for="(gate, i) in gates" :key="gate.id" :data-state="i === nextGate ? 'next' : i < nextGate ? 'cleared' : 'later'">
        <span>{{ gate.id }}</span>{{ gate.name }}<Check v-if="i < nextGate" :size="16"/><MapPin v-else-if="i === nextGate" :size="15"/>
      </li>
    </ol>
    <div class="penalty">累计罚时 <output data-testid="penalty">+{{ penalty }} s</output></div>
  </section>
</template>
