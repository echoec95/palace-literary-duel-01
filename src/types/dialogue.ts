export type DialogueCondition =
  | { type: 'quest_flag'; flag_id: string; equals: boolean }
  | { type: 'inventory_has'; item_id: string }
  | { type: 'reputation_at_least'; value: number }
  | { type: 'ally_affinity_at_least'; character_id: string; value: number };

export type DialogueEffect =
  | { type: 'quest_flag_set'; flag_id: string; value: boolean }
  | { type: 'inventory_add' | 'inventory_remove'; item_id: string }
  | { type: 'reputation_delta'; delta: number }
  | { type: 'ally_affinity_delta'; character_id: string; delta: number }
  | { type: 'knowledge_score_delta'; topic_id: string; delta: number };

export type DialogueChoice = {
  choice_id: string;
  text: string;
  condition?: DialogueCondition;
  effects: DialogueEffect[];
  next_node: string | null;
};

export type DialogueNode = {
  node_id: string;
  scene_id: string;
  speaker_id: string;
  portrait_expression: string;
  dialogue_text: string;
  choices: DialogueChoice[];
  next_node: string | null;
};

export type DialogueScene = {
  scene_id: string;
  start_node: string;
  on_complete: 'investigate' | 'result';
};

export type DialogueCharacter = {
  id: string;
  name: string;
  expressions?: Record<string, string>;
};

export type DialogueValidationIssue = {
  code: string;
  message: string;
  referenceId?: string;
};

export type DialogueRuntimeState = {
  questFlags: Record<string, boolean>;
  inventory: string[];
  reputation: number;
  allyAffinity: Record<string, number>;
  knowledgeScore: Record<string, number>;
};
