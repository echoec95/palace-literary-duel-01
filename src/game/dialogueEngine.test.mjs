import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDialogueEffects, getAvailableDialogueChoices, getDialogueNextNode } from './dialogueEngine.ts';
import { createInitialSave, loadSavedState } from './save.ts';

const state = { questFlags: {}, inventory: [], reputation: 0, allyAffinity: { CONSORT: 1 }, knowledgeScore: {} };
const node = { node_id: 'n1', scene_id: 's', speaker_id: 'CONSORT', portrait_expression: 'neutral', dialogue_text: '台詞', next_node: null, choices: [
  { choice_id: 'open', text: '可選', effects: [], next_node: 'n2' },
  { choice_id: 'locked', text: '條件選項', condition: { type: 'inventory_has', item_id: 'clue' }, effects: [], next_node: 'n3' },
] };

test('choice conditions filter unavailable paths and next-node selection is explicit', () => {
  assert.deepEqual(getAvailableDialogueChoices(node, state).map((choice) => choice.choice_id), ['open']);
  assert.equal(getDialogueNextNode(node, node.choices[0]), 'n2');
  assert.equal(getDialogueNextNode({ ...node, choices: [], next_node: 'n4' }), 'n4');
});

test('effects return a new state and preserve unrelated character values', () => {
  const updated = applyDialogueEffects(state, [
    { type: 'quest_flag_set', flag_id: 'resolved', value: true },
    { type: 'inventory_add', item_id: 'clue' },
    { type: 'ally_affinity_delta', character_id: 'CONSORT', delta: 2 },
    { type: 'knowledge_score_delta', topic_id: 'idiom', delta: 1 },
  ]);
  assert.notEqual(updated, state);
  assert.deepEqual(state.inventory, []);
  assert.equal(updated.questFlags.resolved, true);
  assert.equal(updated.allyAffinity.CONSORT, 3);
  assert.equal(updated.knowledgeScore.idiom, 1);
});

test('v1 argument save migrates to the argument dialogue and keeps progress', () => {
  const saved = loadSavedState(JSON.stringify({ version: 1, unlocked: ['level_01', 'level_02'], cleared: ['level_01'], bestScores: { level_01: 5 }, game: { phase: 'argument', resumePhase: 'map', inspected: ['fan_note_seen'], coreScore: 5, questionIndex: 4 } }));
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.unlocked, ['level_01', 'level_02']);
  assert.deepEqual(saved.cleared, ['level_01']);
  assert.equal(saved.bestScores.level_01, 5);
  assert.equal(saved.game.phase, 'dialogue');
  assert.equal(saved.game.dialogueSceneId, 'level_01_argument');
  assert.equal(saved.game.dialogueNodeId, 'argument_n1');
  assert.deepEqual(saved.game.inspected, ['fan_note_seen']);
  assert.deepEqual(saved.game.dialogueRuntime.inventory, ['fan_note_seen']);
});

test('missing or malformed save falls back to initial state', () => {
  assert.deepEqual(loadSavedState(null), createInitialSave());
  assert.deepEqual(loadSavedState('{broken'), createInitialSave());
});

test('v2 save repairs invalid nested fields while preserving valid progress', () => {
  const saved = loadSavedState(JSON.stringify({
    version: 2, unlocked: ['level_01'], cleared: ['level_01'], bestScores: { level_01: 4 },
    game: { phase: 'quiz', resumePhase: 'map', inspected: null, questionIndex: -1, coreScore: 3,
      answered: 'yes', dialogueRuntime: { questFlags: null, inventory: 'bad', reputation: 'bad', allyAffinity: { CONSORT: 'bad' }, knowledgeScore: { idiom: 2 } } },
  }));
  assert.equal(saved.game.phase, 'quiz');
  assert.deepEqual(saved.game.inspected, []);
  assert.equal(saved.game.questionIndex, 0);
  assert.equal(saved.game.coreScore, 3);
  assert.equal(saved.game.answered, false);
  assert.deepEqual(saved.game.dialogueRuntime, { questFlags: {}, inventory: [], reputation: 0, allyAffinity: {}, knowledgeScore: { idiom: 2 } });
  assert.equal(saved.bestScores.level_01, 4);
});

test('v1 map save resumes the argument dialogue from its start node', () => {
  const saved = loadSavedState(JSON.stringify({ version: 1, unlocked: ['level_01'], game: { phase: 'map', resumePhase: 'argument' } }));
  assert.equal(saved.game.phase, 'map');
  assert.equal(saved.game.resumePhase, 'dialogue');
  assert.equal(saved.game.dialogueSceneId, 'level_01_argument');
  assert.equal(saved.game.dialogueNodeId, 'argument_n1');
});

test('save question progress is clamped to the active level content', () => {
  const saved = loadSavedState(JSON.stringify({
    version: 2, unlocked: ['level_01'], game: { phase: 'quiz', questionIndex: 999, coreScore: 99, hintsUsed: 99 },
  }));
  assert.equal(saved.game.questionIndex, 4);
  assert.equal(saved.game.coreScore, 5);
  assert.equal(saved.game.hintsUsed, 3);
});

test('advanced save retains a valid hint count from the advanced question', () => {
  const saved = loadSavedState(JSON.stringify({ version: 2, unlocked: ['level_01'], game: { phase: 'advanced', hintsUsed: 2 } }));
  assert.equal(saved.game.hintsUsed, 2);
});
