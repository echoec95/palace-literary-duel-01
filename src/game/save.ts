import type { DialogueRuntimeState } from '../types/dialogue.ts';
import questions from '../data/questions.json' with { type: 'json' };

export type Phase = 'map' | 'dialogue' | 'investigate' | 'quiz' | 'remedial' | 'advanced' | 'result';
export type AnswerRecord = {
  questionId: string; phase: 'quiz' | 'remedial' | 'advanced'; attempt: number;
  selectedChoice: string; answerId: string; correct: boolean; hintsUsed: number;
};
export type GameState = {
  phase: Phase; resumePhase: Phase; inspected: string[]; questionIndex: number; coreScore: number;
  remedialScore: number; selectedChoice: string; answered: boolean; hintsUsed: number;
  answerTone: string; advancedComplete: boolean; dialogueSceneId: string; dialogueNodeId: string;
  dialogueRuntime: DialogueRuntimeState; answerHistory: AnswerRecord[]; challengeAttempt: number;
};
export type SavedState = { version: 3; unlocked: string[]; cleared: string[]; bestScores: Record<string, number>; game: GameState };

const initialGame: GameState = {
  phase: 'map', resumePhase: 'map', inspected: [], questionIndex: 0, coreScore: 0, remedialScore: 0,
  selectedChoice: '', answered: false, hintsUsed: 0, answerTone: '', advancedComplete: false,
  dialogueSceneId: '', dialogueNodeId: '', dialogueRuntime: { questFlags: {}, inventory: [], reputation: 0, allyAffinity: {}, knowledgeScore: {} },
  answerHistory: [], challengeAttempt: 0,
};
const phases = new Set<Phase>(['map', 'dialogue', 'investigate', 'quiz', 'remedial', 'advanced', 'result']);
const argumentScene = { scene: 'level_01_argument', node: 'argument_n1' };
const recordOf = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : [];
const numberMap = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(recordOf(value)).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
const booleanMap = (value: unknown): Record<string, boolean> => Object.fromEntries(Object.entries(recordOf(value)).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
const nonNegativeInteger = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
const runtimeFrom = (value: unknown, legacyInventory: string[] = []): DialogueRuntimeState => {
  const runtime = recordOf(value);
  return {
    questFlags: booleanMap(runtime.questFlags),
    inventory: strings(runtime.inventory ?? legacyInventory),
    reputation: typeof runtime.reputation === 'number' && Number.isFinite(runtime.reputation) ? runtime.reputation : 0,
    allyAffinity: numberMap(runtime.allyAffinity),
    knowledgeScore: numberMap(runtime.knowledgeScore),
  };
};

export function createInitialSave(): SavedState {
  return { version: 3, unlocked: ['level_01'], cleared: [], bestScores: {}, game: { ...initialGame } };
}

export function loadSavedState(raw: string | null): SavedState {
  if (!raw) return createInitialSave();
  try {
    const value = recordOf(JSON.parse(raw));
    if (![1, 2, 3].includes(value.version as number) || !value.game || !Array.isArray(value.unlocked)) return createInitialSave();
    const source = recordOf(value.game);
    const legacy = value.version === 1;
    const legacyPhase = (phase: unknown): unknown => legacy && phase === 'argument' ? 'dialogue' : phase;
    const rawPhase = legacyPhase(source.phase);
    const rawResumePhase = legacyPhase(source.resumePhase);
    const game: GameState = {
      ...initialGame,
      phase: typeof rawPhase === 'string' && phases.has(rawPhase as Phase) ? rawPhase as Phase : 'map',
      resumePhase: typeof rawResumePhase === 'string' && phases.has(rawResumePhase as Phase) ? rawResumePhase as Phase : 'map',
      inspected: strings(source.inspected),
      questionIndex: nonNegativeInteger(source.questionIndex, 0),
      coreScore: nonNegativeInteger(source.coreScore, 0),
      remedialScore: nonNegativeInteger(source.remedialScore, 0),
      selectedChoice: typeof source.selectedChoice === 'string' ? source.selectedChoice : '',
      answered: typeof source.answered === 'boolean' ? source.answered : false,
      hintsUsed: nonNegativeInteger(source.hintsUsed, 0),
      answerTone: typeof source.answerTone === 'string' ? source.answerTone : '',
      advancedComplete: typeof source.advancedComplete === 'boolean' ? source.advancedComplete : false,
      dialogueSceneId: typeof source.dialogueSceneId === 'string' ? source.dialogueSceneId : '',
      dialogueNodeId: typeof source.dialogueNodeId === 'string' ? source.dialogueNodeId : '',
      dialogueRuntime: runtimeFrom(source.dialogueRuntime, legacy ? strings(source.inspected) : []),
      answerHistory: Array.isArray(source.answerHistory) ? source.answerHistory.flatMap((item): AnswerRecord[] => {
        const record = recordOf(item);
        if (typeof record.questionId !== 'string' || !['quiz', 'remedial', 'advanced'].includes(record.phase as string)
          || typeof record.selectedChoice !== 'string' || typeof record.answerId !== 'string'
          || typeof record.correct !== 'boolean') return [];
        return [{
          questionId: record.questionId, phase: record.phase as AnswerRecord['phase'],
          attempt: nonNegativeInteger(record.attempt, 0), selectedChoice: record.selectedChoice,
          answerId: record.answerId, correct: record.correct, hintsUsed: nonNegativeInteger(record.hintsUsed, 0),
        }];
      }) : [],
      challengeAttempt: nonNegativeInteger(source.challengeAttempt, 0),
    };
    const activePhase = game.phase === 'map' ? game.resumePhase : game.phase;
    const maxQuestionIndex = activePhase === 'quiz' ? questions.core.length - 1
      : activePhase === 'remedial' ? questions.remedial.length
        : activePhase === 'advanced' ? 0 : Math.max(questions.core.length - 1, questions.remedial.length);
    game.questionIndex = Math.min(game.questionIndex, maxQuestionIndex);
    game.coreScore = Math.min(game.coreScore, questions.core.length);
    game.remedialScore = Math.min(game.remedialScore, questions.remedial.length);
    const activeQuestionList = activePhase === 'quiz' ? questions.core : activePhase === 'remedial' ? questions.remedial : [];
    const currentHints = activePhase === 'advanced' ? questions.advanced.hints : activeQuestionList[game.questionIndex]?.hints;
    game.hintsUsed = Math.min(game.hintsUsed, currentHints?.length ?? 0);
    if (legacy && (source.phase === 'argument' || source.resumePhase === 'argument')) {
      game.dialogueSceneId = argumentScene.scene;
      game.dialogueNodeId = argumentScene.node;
    }
    const unlocked = strings(value.unlocked);
    if (!unlocked.includes('level_01')) unlocked.unshift('level_01');
    return {
      version: 3, unlocked, cleared: strings(value.cleared),
      bestScores: numberMap(value.bestScores), game,
    };
  } catch {
    return createInitialSave();
  }
}
