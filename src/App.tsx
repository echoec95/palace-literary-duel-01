import { useEffect, useState } from 'react';
import levels from './data/levels.json';
import dialogues from './data/dialogues.json';
import characters from './data/characters.json';
import questions from './data/questions.json';
import DialoguePanel from './components/DialoguePanel.tsx';
import ExplorationScene from './components/ExplorationScene.tsx';
import { applyDialogueEffects, getAvailableDialogueChoices, getDialogueNextNode, INITIAL_DIALOGUE_RUNTIME } from './game/dialogueEngine.ts';
import { validateDialogueData } from './game/dialogueValidation.ts';
import { createInitialSave, loadSavedState, type GameState, type SavedState } from './game/save.ts';
import type { DialogueCharacter, DialogueNode, DialogueScene } from './types/dialogue.ts';

const dialogueScenes = dialogues.scenes as DialogueScene[];
const dialogueNodes = dialogues.nodes as DialogueNode[];
const dialogueCharacters = characters as DialogueCharacter[];

type Level = (typeof levels)[number];
const STORAGE_KEY = 'palace-literary-duel-progress-v1';
const initialSave = loadSavedState(typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY));

export default function App() {
  const [selected, setSelected] = useState<Level>(levels[0]);
  const [unlocked, setUnlocked] = useState(initialSave.unlocked);
  const [cleared, setCleared] = useState(initialSave.cleared);
  const [bestScores, setBestScores] = useState(initialSave.bestScores);
  const [game, setGame] = useState<GameState>(initialSave.game);

  useEffect(() => {
    const issues = validateDialogueData(dialogueScenes, dialogueNodes, dialogueCharacters);
    if (import.meta.env.DEV && issues.length) console.error('Dialogue data validation failed:', issues);
    const save: SavedState = { version: 3, unlocked, cleared, bestScores, game };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  }, [unlocked, cleared, bestScores, game]);

  const updateGame = (changes: Partial<GameState>) => setGame((current) => ({ ...current, ...changes }));
  const inspectClue = (clueId: string) => setGame((current) => {
    if (current.inspected.includes(clueId)) return current;
    return {
      ...current,
      inspected: [...current.inspected, clueId],
      dialogueRuntime: {
        ...current.dialogueRuntime,
        inventory: [...new Set([...current.dialogueRuntime.inventory, clueId])],
      },
    };
  });
  const beginLevel = () => setGame((current) => current.resumePhase !== 'map'
    ? { ...current, phase: current.resumePhase, resumePhase: 'map' }
    : { ...createInitialSave().game, answerHistory: current.answerHistory, challengeAttempt: current.challengeAttempt, phase: 'dialogue', dialogueSceneId: 'level_01_intro', dialogueNodeId: 'intro_n1' });
  const activeDialogueNode = dialogueNodes.find((node) => node.node_id === game.dialogueNodeId);
  const finishDialogue = (nextNodeId: string | null) => {
    if (nextNodeId) { updateGame({ dialogueNodeId: nextNodeId }); return; }
    const scene = dialogueScenes.find((item) => item.scene_id === game.dialogueSceneId);
    if (!scene) { console.error('Unknown dialogue scene:', game.dialogueSceneId); return; }
    if (scene.on_complete !== 'investigate' && scene.on_complete !== 'result') {
      console.error('Unsupported dialogue completion phase:', scene.scene_id, scene.on_complete);
      updateGame({ phase: 'map', resumePhase: 'map' });
      return;
    }
    if (scene.on_complete === 'result') {
      setCleared((items) => items.includes('level_01') ? items : [...items, 'level_01']);
      setUnlocked((items) => items.includes('level_02') ? items : [...items, 'level_02']);
      setBestScores((scores) => ({ ...scores, level_01: Math.max(scores.level_01 ?? 0, game.coreScore) }));
      updateGame({ phase: 'result' });
    } else updateGame({ phase: scene.on_complete, dialogueNodeId: '' });
  };
  const continueDialogue = () => {
    if (!activeDialogueNode || activeDialogueNode.choices.length > 0) return;
    finishDialogue(getDialogueNextNode(activeDialogueNode));
  };
  const chooseDialogue = (choiceId: string) => {
    if (!activeDialogueNode || activeDialogueNode.choices.length === 0) return;
    const choice = getAvailableDialogueChoices(activeDialogueNode, game.dialogueRuntime).find((item) => item.choice_id === choiceId);
    if (!choice) return;
    const dialogueRuntime = applyDialogueEffects(game.dialogueRuntime, choice.effects);
    const answerTone = game.dialogueSceneId === 'level_01_argument' ? choiceId : game.answerTone;
    setGame((current) => {
      if (current.phase !== 'dialogue' || current.dialogueNodeId !== activeDialogueNode.node_id) return current;
      return { ...current, dialogueRuntime, answerTone };
    });
    finishDialogue(getDialogueNextNode(activeDialogueNode, choice));
  };
  const coreQuestion = questions.core[game.questionIndex];
  const remedialQuestion = questions.remedial[game.questionIndex];
  const activeQuestion = game.phase === 'quiz' ? coreQuestion : game.phase === 'remedial' ? remedialQuestion : questions.advanced;
  const activeScore = game.phase === 'quiz' ? game.coreScore : game.phase === 'remedial' ? game.remedialScore : 0;
  const activeCount = game.phase === 'quiz' ? questions.core.length : game.phase === 'remedial' ? questions.remedial.length : 1;

  const selectChoice = (choiceId: string) => updateGame({ selectedChoice: choiceId });
  const submitAnswer = () => {
    if (!activeQuestion || !game.selectedChoice || game.answered) return;
    setGame((current) => {
      const question = current.phase === 'quiz' ? questions.core[current.questionIndex]
        : current.phase === 'remedial' ? questions.remedial[current.questionIndex]
          : current.phase === 'advanced' ? questions.advanced : undefined;
      if (!question || !current.selectedChoice || current.answered
        || !['quiz', 'remedial', 'advanced'].includes(current.phase)) return current;
      const correct = current.selectedChoice === question.answerId;
      return {
        ...current,
        answered: true,
        ...(current.phase === 'quiz' && correct ? { coreScore: current.coreScore + 1 } : {}),
        ...(current.phase === 'remedial' && correct ? { remedialScore: current.remedialScore + 1 } : {}),
        answerHistory: [...current.answerHistory, {
          questionId: question.id, phase: current.phase as 'quiz' | 'remedial' | 'advanced',
          attempt: current.challengeAttempt, selectedChoice: current.selectedChoice,
          answerId: question.answerId, correct, hintsUsed: current.hintsUsed,
        }],
      };
    });
  };

  const advanceQuestion = () => {
    if (game.phase === 'quiz' && game.questionIndex + 1 >= questions.core.length) {
      if (game.coreScore >= 4) updateGame({ phase: 'dialogue', dialogueSceneId: 'level_01_argument', dialogueNodeId: 'argument_n1', questionIndex: 0, selectedChoice: '', answered: false, hintsUsed: 0, dialogueRuntime: { ...INITIAL_DIALOGUE_RUNTIME, ...game.dialogueRuntime, knowledgeScore: { ...game.dialogueRuntime.knowledgeScore, __coreScore: game.coreScore } } });
      else updateGame({ phase: 'remedial', questionIndex: 0, selectedChoice: '', answered: false, hintsUsed: 0 });
      return;
    }
    if (game.phase === 'remedial' && game.questionIndex + 1 >= questions.remedial.length) {
      updateGame({ questionIndex: questions.remedial.length, selectedChoice: '', answered: false, hintsUsed: 0 });
      return;
    }
    if (game.phase === 'advanced') {
      updateGame({ phase: 'result', advancedComplete: true, selectedChoice: '', answered: false, hintsUsed: 0 });
      return;
    }
    updateGame({ questionIndex: game.questionIndex + 1, selectedChoice: '', answered: false, hintsUsed: 0 });
  };

  const resetChallenge = () => updateGame({
    phase: 'quiz', questionIndex: 0, coreScore: 0, selectedChoice: '',
    answered: false, hintsUsed: 0, remedialScore: 0, challengeAttempt: game.challengeAttempt + 1,
  });

  const showMap = () => updateGame({
    phase: 'map',
    resumePhase: ['dialogue', 'investigate', 'quiz', 'remedial', 'advanced'].includes(game.phase) ? game.phase : 'map',
  });

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">國中國文學習 · 敘事解謎 RPG</p>
        <h1>紫禁城文鬥風雲</h1>
        <p className="intro">步步解開文字謎局，以知識與論證走完十二宮廷試煉。</p>
      </header>

      {game.phase === 'map' ? <section className="layout" aria-label="關卡選擇">
        <div className="level-panel">
          <div className="section-heading">
            <div><p className="eyebrow">CHAPTER SELECT</p><h2>十二關試煉</h2></div>
            <span className="count">{levels.length} 關</span>
          </div>
          <div className="level-grid">
            {levels.map((level) => (
              <button
                className={`level-card ${selected.id === level.id ? 'active' : ''} ${!unlocked.includes(level.id) ? 'locked' : ''}`}
                key={level.id}
                onClick={() => setSelected(level)}
                disabled={!unlocked.includes(level.id)}
                aria-pressed={selected.id === level.id}
              >
                <span className="level-number">{level.number.toString().padStart(2, '0')}</span>
                <span><strong>{level.title}</strong><small>{cleared.includes(level.id) ? '已完成' : unlocked.includes(level.id) ? level.palace : '尚未開放'}</small></span>
              </button>
            ))}
          </div>
        </div>

        <aside className="detail-panel">
          <p className="eyebrow">目前選擇 · 第 {selected.number.toString().padStart(2, '0')} 關</p>
          <h2>{selected.palace}</h2>
          <h3>{selected.title}</h3>
          <div className="divider" />
          <dl>
            <div><dt>學習主題</dt><dd>{selected.topic}</dd></div>
            <div><dt>劇情事件</dt><dd>{selected.event}</dd></div>
          </dl>
          <p className="prototype-note">{selected.id === 'level_01' ? '查看御花園線索，運用成語知識找出說法中的矛盾。' : '此關內容仍在規劃中。'}</p>
          <button className="start-button" disabled={!unlocked.includes(selected.id) || selected.id !== 'level_01'} onClick={beginLevel}>
            {selected.id !== 'level_01' ? unlocked.includes(selected.id) ? '內容準備中' : '尚未開放' : game.resumePhase !== 'map' ? '繼續遊玩' : cleared.includes(selected.id) ? '再次遊玩' : '進入關卡'}
          </button>
          {cleared.includes(selected.id) && <p className="best-score">最佳成績：{bestScores[selected.id] ?? 0}/5</p>}
        </aside>
      </section>
      : <section className="game-layout" aria-label="御花園關卡">
        <div className="game-toolbar">
          <button className="text-button" onClick={showMap}>← 返回關卡地圖</button>
          <span>第 01 關 · 御花園</span>
          <span className="save-indicator">進度自動保存</span>
        </div>

        {game.phase === 'dialogue' && (activeDialogueNode ? <DialoguePanel
          node={activeDialogueNode} runtime={game.dialogueRuntime} characters={dialogueCharacters} coreScore={game.coreScore}
          onContinue={continueDialogue} onChoose={chooseDialogue} onReturnToMap={showMap}
        /> : <section className="story-card dialogue-error" role="alert"><h2>對話資料無法載入</h2><p>目前節點不存在或屬於其他場景。請返回地圖，進度已保留。</p><button className="start-button" onClick={showMap}>返回關卡地圖</button></section>)}

        {game.phase === 'investigate' && <div className="game-content">
          <section className="clue-panel exploration-panel">
            <ExplorationScene clues={dialogues.clues} inspected={game.inspected} onInspect={inspectClue} />
            <button className="start-button" disabled={game.inspected.length < dialogues.clues.length} onClick={() => updateGame({ phase: 'quiz', questionIndex: 0, coreScore: 0, selectedChoice: '', answered: false, hintsUsed: 0, challengeAttempt: game.challengeAttempt + 1 })}>
              {game.inspected.length < dialogues.clues.length ? '查看全部線索後開始挑戰' : '開始成語挑戰'}
            </button>
          </section>
        </div>}

        {(game.phase === 'quiz' || game.phase === 'remedial' || game.phase === 'advanced') && activeQuestion && <section className="quiz-card">
          <div className="quiz-heading">
            <div><p className="eyebrow">{game.phase === 'quiz' ? 'CORE CHALLENGE' : game.phase === 'remedial' ? 'PRACTICE' : 'BONUS'}</p>
              <h2>{game.phase === 'quiz' ? '成語挑戰' : game.phase === 'remedial' ? '補救練習' : '進階題'}</h2></div>
            <span className="count">{game.phase === 'advanced' ? '選做' : `${Math.min(game.questionIndex + 1, activeCount)}/${activeCount}`}</span>
          </div>
          {game.phase === 'quiz' && <div className="score-strip">目前答對 <strong>{game.coreScore}</strong> 題</div>}
          <h3 className="question-stem">{activeQuestion.stem}</h3>
          <div className="answer-list" role="group" aria-label="選擇答案">
            {activeQuestion.choices.map((choice) => <button
              key={choice.id}
              className={`answer-choice ${game.selectedChoice === choice.id ? 'selected' : ''} ${game.answered && choice.id === activeQuestion.answerId ? 'correct' : ''} ${game.answered && game.selectedChoice === choice.id && choice.id !== activeQuestion.answerId ? 'incorrect' : ''}`}
              onClick={() => selectChoice(choice.id)} disabled={game.answered}
              aria-pressed={game.selectedChoice === choice.id}
            ><span className="choice-letter">{choice.id}</span><span>{choice.text}</span></button>)}
          </div>
          {!game.answered && <div className="quiz-actions">
            <button className="hint-button" onClick={() => updateGame({ hintsUsed: Math.min(game.hintsUsed + 1, activeQuestion.hints.length) })} disabled={game.hintsUsed >= activeQuestion.hints.length}>查看提示 {game.hintsUsed}/{activeQuestion.hints.length}</button>
            <button className="start-button" onClick={submitAnswer} disabled={!game.selectedChoice}>確認答案</button>
          </div>}
          {game.hintsUsed > 0 && !game.answered && <div className="hint-box"><strong>提示 {game.hintsUsed}</strong><p>{activeQuestion.hints[game.hintsUsed - 1]}</p></div>}
          {game.answered && <div className={`feedback-box ${game.selectedChoice === activeQuestion.answerId ? 'success' : 'retry'}`} role="status">
            <strong>{game.selectedChoice === activeQuestion.answerId ? '答對了' : `正確答案：${activeQuestion.answerId}`}</strong>
            <p>{activeQuestion.explanation}</p>
            <button className="start-button" onClick={advanceQuestion}>{game.questionIndex + 1 >= activeCount ? game.phase === 'quiz' ? '查看挑戰結果' : game.phase === 'remedial' ? '完成補救練習' : '完成進階題' : '下一題'}</button>
          </div>}
        </section>}

        {game.phase === 'remedial' && game.questionIndex >= questions.remedial.length && <section className="result-card">
          <p className="eyebrow">補救練習完成</p><h2>再試一次，線索還在等你</h2>
          <p>補救題答對 {game.remedialScore}/{questions.remedial.length} 題。核心題進度不會因練習而消失。</p>
          <button className="start-button" onClick={resetChallenge}>重新挑戰五題</button>
        </section>}

        {game.phase === 'result' && <section className="result-card">
          <p className="eyebrow">{game.coreScore >= 4 ? '御花園線索已取得' : '練習已完成'}</p>
          <h2>{game.coreScore >= 4 ? '以文會友，查明語意' : '再複習一次也可以'}</h2>
          {game.coreScore >= 4 ? <>
            <p>核心題答對 {game.coreScore}/5 題。你指出了詞義與語境的落差，取得「御花園線索」。第 02 關已解鎖。</p>
            <div className="answer-review" aria-label="本次核心題作答回顧">
              <h3>本次作答回顧</h3>
              {game.answerHistory.filter((record) => record.phase === 'quiz' && record.attempt === game.challengeAttempt).map((record, index) => {
                const question = questions.core.find((item) => item.id === record.questionId);
                const selectedAnswer = question?.choices.find((choice) => choice.id === record.selectedChoice)?.text;
                return <div className="answer-review-row" key={`${record.questionId}-${index}`}>
                  <strong>第 {index + 1} 題 · {record.correct ? '答對' : '再複習'}</strong>
                  <span>{question?.stem}</span>
                  <small>你的選擇：{record.selectedChoice}（{selectedAnswer}）{record.correct ? '' : `；正確答案：${record.answerId}`} · 使用提示 {record.hintsUsed} 級</small>
                </div>;
              })}
            </div>
            {game.answerTone && <p className="response-note">{dialogueNodes.find((item) => item.node_id === `reply_${game.answerTone === 'gentle_reply' ? 'gentle' : game.answerTone.replace('_first', '')}`)?.dialogue_text}</p>}
            {game.advancedComplete && <p className="knowledge-pill">已完成進階題</p>}
            <div className="result-actions"><button className="secondary-button" onClick={() => updateGame({ phase: 'advanced', questionIndex: 0, selectedChoice: '', answered: false, hintsUsed: 0 })}>挑戰進階題</button><button className="start-button" onClick={showMap}>返回關卡地圖</button></div>
          </> : <>
            <p>核心題答對 {game.coreScore}/5 題。你可以查看解析、完成補救練習，或直接再挑戰一次。</p>
            <button className="start-button" onClick={resetChallenge}>重新挑戰五題</button>
          </>}
        </section>}
      </section>}
      <footer>以文字推理取勝 · 架空宮廷故事 · 進度保存在此瀏覽器</footer>
    </main>
  );
}
