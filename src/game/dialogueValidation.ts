import type {
  DialogueCharacter,
  DialogueNode,
  DialogueScene,
  DialogueValidationIssue,
} from '../types/dialogue.ts';

export function validateDialogueData(
  scenes: readonly DialogueScene[],
  nodes: readonly DialogueNode[],
  characters: readonly DialogueCharacter[],
): DialogueValidationIssue[] {
  const issues: DialogueValidationIssue[] = [];
  const sceneIds = new Set<string>();
  const nodeIds = new Set<string>();
  const characterIds = new Set(characters.map((character) => character.id));
  const nodeById = new Map<string, DialogueNode>();
  const choiceIds = new Set<string>();

  for (const scene of scenes) {
    if (scene.on_complete !== 'investigate' && scene.on_complete !== 'result') {
      issues.push({ code: 'invalid-on-complete', message: `Scene ${scene.scene_id} has unsupported on_complete stage`, referenceId: scene.scene_id });
    }
    if (sceneIds.has(scene.scene_id)) {
      issues.push({ code: 'duplicate-scene-id', message: `Duplicate scene ID: ${scene.scene_id}`, referenceId: scene.scene_id });
    }
    sceneIds.add(scene.scene_id);
  }

  for (const node of nodes) {
    if (nodeIds.has(node.node_id)) {
      issues.push({ code: 'duplicate-node-id', message: `Duplicate node ID: ${node.node_id}`, referenceId: node.node_id });
    } else {
      nodeIds.add(node.node_id);
      nodeById.set(node.node_id, node);
    }
    if (!sceneIds.has(node.scene_id)) {
      issues.push({ code: 'missing-scene', message: `Node ${node.node_id} references unknown scene ${node.scene_id}`, referenceId: node.node_id });
    }
    if (!characterIds.has(node.speaker_id)) {
      issues.push({ code: 'missing-speaker', message: `Node ${node.node_id} references unknown speaker ${node.speaker_id}`, referenceId: node.node_id });
    }
    if (node.choices.length > 0 && node.next_node !== null) {
      issues.push({ code: 'node-next-with-choices', message: `Choice node ${node.node_id} must not have a node-level next_node`, referenceId: node.node_id });
    }
    for (const choice of node.choices) {
      if (choiceIds.has(choice.choice_id)) {
        issues.push({ code: 'duplicate-choice-id', message: `Duplicate choice ID: ${choice.choice_id}`, referenceId: choice.choice_id });
      }
      choiceIds.add(choice.choice_id);
    }
  }

  const reportTarget = (source: DialogueNode, targetId: string | null, edgeId: string) => {
    if (targetId === null) return;
    const target = nodeById.get(targetId);
    if (!target) {
      issues.push({ code: 'missing-next-node', message: `${edgeId} references unknown node ${targetId}`, referenceId: edgeId });
    } else if (target.scene_id !== source.scene_id) {
      issues.push({ code: 'cross-scene-transition', message: `${edgeId} leaves scene ${source.scene_id}`, referenceId: edgeId });
    }
  };

  for (const node of nodes) {
    reportTarget(node, node.next_node, node.node_id);
    for (const choice of node.choices) reportTarget(node, choice.next_node, choice.choice_id);
  }

  for (const scene of scenes) {
    const start = nodeById.get(scene.start_node);
    if (!start) {
      issues.push({ code: 'missing-start-node', message: `Scene ${scene.scene_id} references unknown start node ${scene.start_node}`, referenceId: scene.scene_id });
      continue;
    }
    if (start.scene_id !== scene.scene_id) {
      issues.push({ code: 'start-node-wrong-scene', message: `Scene ${scene.scene_id} starts at a node in ${start.scene_id}`, referenceId: scene.scene_id });
      continue;
    }

    const reachable = new Set<string>();
    const pending = [start.node_id];
    while (pending.length > 0) {
      const nodeId = pending.pop()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      const node = nodeById.get(nodeId);
      if (!node) continue;
      if (node.choices.length > 0) {
        for (const choice of node.choices) if (choice.next_node) pending.push(choice.next_node);
      } else if (node.next_node) {
        pending.push(node.next_node);
      }
    }

    for (const node of nodes) {
      if (node.scene_id === scene.scene_id && !reachable.has(node.node_id)) {
        issues.push({ code: 'unreachable-node', message: `Node ${node.node_id} cannot be reached from scene ${scene.scene_id}`, referenceId: node.node_id });
      }
    }
  }

  return issues;
}
