import { useEffect, useState } from 'react';

const defaultTypingHints = [
  '试试说：帮我创建一个图片分类标注任务',
  '试试说：根据当前模板和数据集补全发布配置',
  '试试说：帮我生成任务标题、描述和标签',
  '试试说：推荐一个适合这批数据的奖励策略',
  '试试说：帮我检查发布前还有哪些阻塞项',
  '试试说：为这个任务生成 AI 预审评分矩阵',
  '试试说：根据数据量估算标注奖励和平台手续费',
  '试试说：帮我生成任务用户协议',
  '试试说：帮我配置人工复审人员和分配量',
];

const TYPE_DELAY_MS = 58;
const DELETE_DELAY_MS = 34;
const COMPLETE_HOLD_MS = 12_000;
const EMPTY_PAUSE_MS = 1_500;

type TypingState = {
  hintIndex: number;
  text: string;
  phase: 'typing' | 'holding' | 'deleting' | 'emptyPause';
};

export function useTaskPublishTypingPlaceholder(paused: boolean, hints = defaultTypingHints) {
  const [state, setState] = useState<TypingState>({ hintIndex: 0, text: '', phase: 'typing' });
  const hintCount = hints.length;

  useEffect(() => {
    if (paused) return undefined;
    const delay = state.phase === 'holding'
      ? COMPLETE_HOLD_MS
      : state.phase === 'emptyPause'
        ? EMPTY_PAUSE_MS
        : state.phase === 'deleting'
          ? DELETE_DELAY_MS
          : TYPE_DELAY_MS;
    const timer = window.setTimeout(() => {
      setState((currentState) => {
        const hint = hints[currentState.hintIndex] ?? hints[0] ?? '';
        if (currentState.phase === 'holding') return { ...currentState, phase: 'deleting' };
        if (currentState.phase === 'emptyPause') {
          return { hintIndex: (currentState.hintIndex + 1) % Math.max(1, hintCount), text: '', phase: 'typing' };
        }
        if (currentState.phase === 'typing' && currentState.text.length < hint.length) {
          return { ...currentState, text: hint.slice(0, currentState.text.length + 1) };
        }
        if (currentState.phase === 'typing') return { ...currentState, phase: 'holding' };
        if (currentState.text.length > 0) {
          return { ...currentState, text: hint.slice(0, currentState.text.length - 1) };
        }
        return { ...currentState, phase: 'emptyPause' };
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hintCount, hints, paused, state.hintIndex, state.phase, state.text]);

  return state.text;
}
