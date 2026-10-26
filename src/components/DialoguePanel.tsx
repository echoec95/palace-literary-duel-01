import type { DialogueCharacter, DialogueNode, DialogueRuntimeState } from '../types/dialogue.ts';
import { getAvailableDialogueChoices } from '../game/dialogueEngine.ts';

type Props = {
  node: DialogueNode; runtime: DialogueRuntimeState; characters: DialogueCharacter[]; coreScore: number;
  onContinue: () => void; onChoose: (choiceId: string) => void; onReturnToMap: () => void;
};

export default function DialoguePanel({ node, runtime, characters, coreScore, onContinue, onChoose, onReturnToMap }: Props) {
  const character = characters.find((item) => item.id === node.speaker_id);
  const choices = getAvailableDialogueChoices(node, runtime);
  const text = node.dialogue_text.replaceAll('{coreScore}', String(coreScore));
  return <section className="story-card dialogue-panel" aria-live="polite">
    <div className="dialogue-heading"><p className="eyebrow">{character?.name ?? `未知角色（${node.speaker_id}）`}</p><span className="portrait-expression">{character?.expressions?.[node.portrait_expression] ?? node.portrait_expression}</span></div>
    <p className="dialogue-text">{text}</p>
    {node.choices.length > 0 && choices.length === 0 && <p className="dialogue-error" role="alert">目前沒有符合條件的對話選項，請返回關卡地圖。</p>}
    <div className="dialogue-actions">
      {node.choices.length === 0 && <button className="start-button" onClick={onContinue}>{node.next_node ? '繼續' : '完成對話'}</button>}
      {choices.map((choice) => <button className="answer-choice" key={choice.choice_id} onClick={() => onChoose(choice.choice_id)}>{choice.text}</button>)}
      <button className="text-button" onClick={onReturnToMap}>← 返回關卡地圖</button>
    </div>
  </section>;
}
