import type { DialogueChoice, DialogueCondition, DialogueNode, DialogueRuntimeState, DialogueEffect } from '../types/dialogue.ts';

export const INITIAL_DIALOGUE_RUNTIME: DialogueRuntimeState = {
  questFlags: {}, inventory: [], reputation: 0, allyAffinity: {}, knowledgeScore: {},
};

export function evaluateDialogueCondition(condition: DialogueCondition, state: DialogueRuntimeState): boolean {
  switch (condition.type) {
    case 'quest_flag': return (state.questFlags[condition.flag_id] ?? false) === condition.equals;
    case 'inventory_has': return state.inventory.includes(condition.item_id);
    case 'reputation_at_least': return state.reputation >= condition.value;
    case 'ally_affinity_at_least': return (state.allyAffinity[condition.character_id] ?? 0) >= condition.value;
  }
}

export function getAvailableDialogueChoices(node: DialogueNode, state: DialogueRuntimeState): DialogueChoice[] {
  return node.choices.filter((choice) => !choice.condition || evaluateDialogueCondition(choice.condition, state));
}

export function applyDialogueEffects(state: DialogueRuntimeState, effects: readonly DialogueEffect[]): DialogueRuntimeState {
  return effects.reduce<DialogueRuntimeState>((current, effect) => {
    switch (effect.type) {
      case 'quest_flag_set': return { ...current, questFlags: { ...current.questFlags, [effect.flag_id]: effect.value } };
      case 'inventory_add': return current.inventory.includes(effect.item_id) ? current : { ...current, inventory: [...current.inventory, effect.item_id] };
      case 'inventory_remove': return { ...current, inventory: current.inventory.filter((item) => item !== effect.item_id) };
      case 'reputation_delta': return { ...current, reputation: current.reputation + effect.delta };
      case 'ally_affinity_delta': return { ...current, allyAffinity: { ...current.allyAffinity, [effect.character_id]: (current.allyAffinity[effect.character_id] ?? 0) + effect.delta } };
      case 'knowledge_score_delta': return { ...current, knowledgeScore: { ...current.knowledgeScore, [effect.topic_id]: (current.knowledgeScore[effect.topic_id] ?? 0) + effect.delta } };
    }
  }, state);
}

export function getDialogueNextNode(node: DialogueNode, choice?: DialogueChoice): string | null {
  return node.choices.length > 0 ? choice?.next_node ?? null : node.next_node;
}
