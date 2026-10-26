import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dialogues = JSON.parse(readFileSync(new URL('../data/dialogues.json', import.meta.url), 'utf8'));
const castData = JSON.parse(readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8'));
const module = await import('./dialogueValidation.ts').catch(() => null);
const validateDialogueData = module?.validateDialogueData;
const characters = [{ id: 'CONSORT', name: '權妃' }];

const validScene = { scene_id: 'opening', start_node: 'n1', on_complete: 'investigate' };
const validNodes = [
  { node_id: 'n1', scene_id: 'opening', speaker_id: 'CONSORT', portrait_expression: 'neutral', dialogue_text: '先看證據。', choices: [], next_node: 'n2' },
  { node_id: 'n2', scene_id: 'opening', speaker_id: 'CONSORT', portrait_expression: 'neutral', dialogue_text: '再作判斷。', choices: [], next_node: null },
];

function validate(scenes, nodes, cast = characters) {
  assert.equal(typeof validateDialogueData, 'function', 'validateDialogueData must be exported');
  return validateDialogueData(scenes, nodes, cast);
}

test('dialogue data is migrated to scenes, nodes, and clues', () => {
  assert.ok(Array.isArray(dialogues.scenes));
  assert.ok(Array.isArray(dialogues.nodes));
  assert.ok(Array.isArray(dialogues.clues));
  assert.ok(dialogues.scenes.length > 0);
  assert.ok(dialogues.nodes.length > 0);
  assert.equal(dialogues.clues.length, 3);
});

test('validator accepts a reachable linear scene', () => {
  assert.deepEqual(validate([validScene], validNodes), []);
});

test('migrated first-level dialogue graph has no broken references', () => {
  assert.deepEqual(validate(dialogues.scenes, dialogues.nodes, castData), []);
});

test('validator reports duplicate node IDs', () => {
  const duplicate = { ...validNodes[0], scene_id: 'opening' };
  const issues = validate([validScene], [...validNodes, duplicate]);
  assert.ok(issues.some((issue) => issue.code === 'duplicate-node-id'));
});

test('validator rejects unsupported scene completion stages', () => {
  const issues = validate([{ ...validScene, on_complete: 'map' }], validNodes);
  assert.ok(issues.some((issue) => issue.code === 'invalid-on-complete'));
});

test('validator reports unknown start and transition targets', () => {
  const badScene = { ...validScene, start_node: 'missing' };
  const badNode = { ...validNodes[0], next_node: 'ghost' };
  const issues = validate([badScene], [badNode], characters);
  assert.ok(issues.some((issue) => issue.code === 'missing-start-node'));
  assert.ok(issues.some((issue) => issue.code === 'missing-next-node'));
});

test('validator reports unreachable nodes and choice node fallback edges', () => {
  const choiceNode = {
    ...validNodes[0],
    choices: [{ choice_id: 'c1', text: '走分支', effects: [], next_node: 'n2' }],
  };
  const unreachable = { ...validNodes[1], node_id: 'n3', next_node: null };
  const issues = validate([validScene], [choiceNode, validNodes[1], unreachable]);
  assert.ok(issues.some((issue) => issue.code === 'node-next-with-choices'));
  assert.ok(issues.some((issue) => issue.code === 'unreachable-node'));
});
