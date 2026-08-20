import { useEffect, useRef, useState } from 'react';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function ConquiztadorQuestion({
  context,
  deadlineAt,
  durationMs,
  onAnswer,
  question,
}) {
  const remainingUntilDeadline = () => Math.max(
    0,
    Math.min(durationMs, Number(deadlineAt) - Date.now())
  );
  const [remainingMs, setRemainingMs] = useState(remainingUntilDeadline);
  const [estimate, setEstimate] = useState('');
  const submittedRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const elapsedBeforeMountRef = useRef(durationMs - remainingUntilDeadline());
  const estimateInputRef = useRef(null);
  const dialogRef = useRef(null);
  const multipleChoice = question.type === 'MULTIPLE_CHOICE';
  const answers = question.answers || question.options || [];

  const submit = value => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const responseMs = Math.min(
      durationMs,
      Math.max(0, elapsedBeforeMountRef.current + Date.now() - startedAtRef.current)
    );
    onAnswer(value, responseMs);
  };

  useEffect(() => {
    submittedRef.current = false;
    const initialRemaining = remainingUntilDeadline();
    startedAtRef.current = Date.now();
    elapsedBeforeMountRef.current = durationMs - initialRemaining;
    setRemainingMs(initialRemaining);
    const interval = window.setInterval(() => {
      setRemainingMs(remainingUntilDeadline());
    }, 50);
    const timeout = window.setTimeout(() => submit(null), initialRemaining);
    if (!multipleChoice) {
      const frame = window.requestAnimationFrame(() => estimateInputRef.current?.focus());
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearInterval(interval);
        window.clearTimeout(timeout);
      };
    }
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
    // A new component key is used for every question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, durationMs, question.sequence]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement;
    const getFocusable = () => [...dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.hidden);
    const frame = window.requestAnimationFrame(() => {
      const initial = dialog.querySelector('[data-dialog-initial]') || getFocusable()[0] || dialog;
      initial.focus();
    });
    const trapFocus = event => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trapFocus);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [question.sequence]);

  useEffect(() => {
    if (!multipleChoice) return undefined;
    const handleKeyDown = event => {
      const target = event.target;
      const editableTarget = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || editableTarget) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= answers.length) return;
      event.preventDefault();
      submit(index);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length, multipleChoice, question.sequence]);

  const seconds = (remainingMs / 1000).toFixed(1);
  const progress = Math.max(0, Math.min(100, remainingMs / durationMs * 100));

  return (
    <div className="cq-overlay cq-question-overlay">
      <section
        ref={dialogRef}
        className="cq-question-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cq-question-title"
        tabIndex="-1"
      >
        <div className="cq-question-topline">
          <span>{question.category}</span>
          <strong>{context}</strong>
        </div>
        <h2 id="cq-question-title">{question.text || question.prompt}</h2>

        {multipleChoice ? (
          <div className="cq-answer-grid" role="group" aria-label="Варианты ответа">
            {answers.map((answer, index) => (
              <button
                key={`${question.id}-${index}`}
                className="cq-answer-button"
                type="button"
                data-dialog-initial={index === 0 ? '' : undefined}
                onClick={() => submit(index)}
              >
                <span aria-hidden="true">{LETTERS[index]}</span>
                <strong>{answer}</strong>
                <small>{index + 1}</small>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="cq-estimate-form"
            onSubmit={event => {
              event.preventDefault();
              submit(estimate === '' ? null : Number(estimate));
            }}
          >
            <label htmlFor="cq-estimate-answer">Ваш числовой ответ</label>
            <div>
              <input
                ref={estimateInputRef}
                data-dialog-initial
                id="cq-estimate-answer"
                type="number"
                inputMode="numeric"
                step="1"
                value={estimate}
                onChange={event => setEstimate(event.target.value)}
                placeholder="Введите число"
                autoComplete="off"
              />
              <button className="cq-primary-action" type="submit" disabled={estimate === ''}>
                Ответить
              </button>
            </div>
          </form>
        )}

        <div className="cq-timer" aria-label={`Осталось ${seconds} секунды`}>
          <div className="cq-timer-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <strong>{seconds}</strong>
        </div>
        {multipleChoice && <p className="cq-keyboard-hint">Можно нажать клавиши 1–4</p>}
      </section>
    </div>
  );
}
