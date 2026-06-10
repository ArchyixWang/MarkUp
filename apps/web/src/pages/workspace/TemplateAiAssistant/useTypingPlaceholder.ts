import { useEffect, useState } from 'react';

const typingHints = [
  '试试说：帮我生成一个图片分类标注模版',
  '试试说：添加一个文本情感分类字段',
  '试试说：为目标检测任务生成标签配置',
  '试试说：把标签选项改成“合格 / 不合格 / 不确定”',
  '试试说：帮我优化字段名称，让标注员更容易理解',
  '试试说：给这个模版增加质检备注字段',
  '试试说：生成一个适合文本实体抽取的标注模版',
  '试试说：删除不必要的说明字段',
];

const TYPE_DELAY_MS = 58;
const DELETE_DELAY_MS = 34;
const COMPLETE_HOLD_MS = 12_000;
const EMPTY_PAUSE_MS = 1_500;

interface TypingPlaceholderOptions {
  hints?: string[];
  typeDelayMs?: number;
  deleteDelayMs?: number;
  completeHoldMs?: number;
  emptyPauseMs?: number;
}

export function useTypingPlaceholder(paused: boolean, options: TypingPlaceholderOptions = {}) {
  const hints = options.hints?.length ? options.hints : typingHints;
  const typeDelayMs = options.typeDelayMs ?? TYPE_DELAY_MS;
  const deleteDelayMs = options.deleteDelayMs ?? DELETE_DELAY_MS;
  const completeHoldMs = options.completeHoldMs ?? COMPLETE_HOLD_MS;
  const emptyPauseMs = options.emptyPauseMs ?? EMPTY_PAUSE_MS;
  const [hintIndex, setHintIndex] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting' | 'emptyPause'>('typing');

  useEffect(() => {
    if (paused) return undefined;
    const current = hints[hintIndex] ?? hints[0] ?? '';
    const delay = phase === 'holding'
      ? completeHoldMs
      : phase === 'emptyPause'
        ? emptyPauseMs
        : deleting
          ? deleteDelayMs
          : typeDelayMs;
    const timer = window.setTimeout(() => {
      if (phase === 'holding') {
        setPhase('deleting');
        setDeleting(true);
        return;
      }
      if (phase === 'emptyPause') {
        setPhase('typing');
        setHintIndex((index) => (index + 1) % hints.length);
        return;
      }
      if (!deleting && text.length < current.length) {
        setText(current.slice(0, text.length + 1));
        return;
      }
      if (!deleting && text.length >= current.length) {
        setPhase('holding');
        return;
      }
      if (deleting && text.length > 0) {
        setText(current.slice(0, text.length - 1));
        return;
      }
      setDeleting(false);
      setPhase('emptyPause');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [completeHoldMs, deleteDelayMs, deleting, emptyPauseMs, hintIndex, hints, paused, phase, text, typeDelayMs]);

  return text;
}
