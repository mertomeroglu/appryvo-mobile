import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowLeft, Check, ListChecks, Pencil, PenLine, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Modal } from '../../components/ui/Modal';
import { AppButton } from '../../components/ui/AppButton';
import { FilterChip } from '../../components/ui/Chip';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { ApiException } from '../../services/api/apiClient';
import { toast } from '../../stores/useToastStore';

import { DURATION, PRESS_SCALE, SPRING } from '../../motion/tokens';
import { cn } from '../../lib/utils';
import {
  useCreateProfileQuestionMutation,
  useDeleteProfileQuestionMutation,
  useOwnProfileQuestionsQuery,
  useQuestionPresetsQuery,
  useReorderProfileQuestionsMutation,
  useUpdateProfileQuestionMutation,
  type OwnProfileQuestion,
  type ProfileQuestionInput,
  type QuestionOption,
  type QuestionPreset,
} from '../../hooks/useQuestionQueries';
import { questionCategoryKey, questionErrorKey, useQuestionText, type QuestionTextKey } from './questionLocale';

export const MAX_PROFILE_QUESTIONS = 3;

/** Mirrors the server's profile_question_service validation (contact-info detection stays server-side). */
export function validateQuestionInput(input: Partial<ProfileQuestionInput>): QuestionTextKey | null {
  const text = String(input.questionText || '').trim();
  const a = String(input.optionA || '').trim();
  const b = String(input.optionB || '').trim();
  if (text.length < 3 || text.length > 160) return 'errTextLength';
  if (a.length < 1 || a.length > 80 || b.length < 1 || b.length > 80) return 'errOptionLength';
  if (a.toLocaleLowerCase() === b.toLocaleLowerCase()) return 'errIdentical';
  if (input.correctOption !== 'A' && input.correctOption !== 'B') return 'errCorrectRequired';
  return null;
}

function normalizeInput(input: ProfileQuestionInput): ProfileQuestionInput {
  return {
    questionText: input.questionText.trim(),
    optionA: input.optionA.trim(),
    optionB: input.optionB.trim(),
    correctOption: input.correctOption,
    presetId: input.presetId || null,
  };
}

// ---------------------------------------------------------------------------------------------
// Form sheet (create/edit) with the preset picker
// ---------------------------------------------------------------------------------------------

interface ProfileQuestionFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: ProfileQuestionInput | null;
  /** Throw an ApiException to surface a server validation error inside the form. */
  onSubmit: (input: ProfileQuestionInput) => Promise<void> | void;
  submitting?: boolean;
}

type FormMode = 'choose' | 'presets' | 'form';

const EMPTY_FORM = { questionText: '', optionA: '', optionB: '', correctOption: null as QuestionOption | null, presetId: null as string | null };

export const ProfileQuestionFormSheet: React.FC<ProfileQuestionFormSheetProps> = ({
  isOpen,
  onClose,
  initial,
  onSubmit,
  submitting = false,
}) => {
  const { locale, qt } = useQuestionText();
  const [mode, setMode] = useState<FormMode>('choose');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<QuestionTextKey | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const presetsQuery = useQuestionPresetsQuery(locale, isOpen && mode === 'presets');

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCategory(null);
    if (initial) {
      setForm({ ...initial, presetId: initial.presetId || null });
      setMode('form');
    } else {
      setForm(EMPTY_FORM);
      setMode('choose');
    }
  }, [isOpen, initial]);

  // Memoized so the `|| []` fallback isn't a fresh array identity on every render, which would
  // otherwise invalidate the dependent memos below on each pass.
  const presets = useMemo(() => presetsQuery.data || [], [presetsQuery.data]);
  const categories = useMemo(() => Array.from(new Set(presets.map((p) => p.category))), [presets]);
  const visiblePresets = category ? presets.filter((p) => p.category === category) : presets;

  const pickPreset = (preset: QuestionPreset) => {
    // The owner still chooses their own correct answer -- presets carry no "right" option.
    setForm({ questionText: preset.questionText, optionA: preset.optionA, optionB: preset.optionB, correctOption: null, presetId: preset.id });
    setError(null);
    setMode('form');
  };

  const submit = async () => {
    const validation = validateQuestionInput({ ...form, correctOption: form.correctOption || undefined });
    if (validation) {
      setError(validation);
      return;
    }
    try {
      await onSubmit(normalizeInput({ ...form, correctOption: form.correctOption as QuestionOption }));
    } catch (err) {
      setError(questionErrorKey(err instanceof ApiException ? err.code : null));
    }
  };

  const field = 'w-full rounded-2xl border border-app bg-surface-elevated px-4 py-3 text-body text-app placeholder:text-app-muted focus:border-brand-primary focus:outline-none';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="max-h-[82vh] overflow-y-auto px-6 pb-6 pt-2 touch-pan-y" data-testid="profile-question-form">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: DURATION.micro }}
          >
            {mode === 'choose' && (
              <div>
                <h2 className="text-title text-app">{qt('newQuestionTitle')}</h2>
                <div className="mt-5 space-y-3">
                  <ChoiceRow icon={<ListChecks className="h-5 w-5" />} label={qt('pickPreset')} onClick={() => setMode('presets')} />
                  <ChoiceRow icon={<PenLine className="h-5 w-5" />} label={qt('writeOwn')} onClick={() => { setForm(EMPTY_FORM); setMode('form'); }} />
                </div>
              </div>
            )}

            {mode === 'presets' && (
              <div>
                <div className="flex items-center gap-2">
                  <IconButton aria-label={qt('cancel')} variant="ghost" size="sm" onClick={() => setMode('choose')}>
                    <ArrowLeft className="h-5 w-5" />
                  </IconButton>
                  <h2 className="text-title text-app">{qt('presetsTitle')}</h2>
                </div>
                {categories.length > 1 && (
                  <div className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1 no-scrollbar">
                    <FilterChip selected={category === null} onClick={() => setCategory(null)}>{qt('presetsTitle')}</FilterChip>
                    {categories.map((c) => {
                      const key = questionCategoryKey(c);
                      return (
                        <FilterChip key={c} selected={category === c} onClick={() => setCategory(c)} className="whitespace-nowrap">
                          {key ? qt(key) : c}
                        </FilterChip>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4 space-y-2.5">
                  {presetsQuery.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} variant="card" className="h-20" />)}
                  {presetsQuery.isError && (
                    <ErrorState title={qt('errGeneric')} onRetry={() => void presetsQuery.refetch()} />
                  )}
                  {!presetsQuery.isLoading && !presetsQuery.isError && visiblePresets.length === 0 && (
                    <p className="py-6 text-center text-caption text-app-muted">{qt('presetsEmpty')}</p>
                  )}
                  {visiblePresets.map((preset) => (
                    <motion.button
                      key={preset.id}
                      type="button"
                      whileTap={{ scale: PRESS_SCALE }}
                      transition={SPRING.snappy}
                      onClick={() => pickPreset(preset)}
                      className="w-full rounded-2xl border border-app bg-surface-elevated p-4 text-left"
                    >
                      <p className="text-body font-semibold text-app">{preset.questionText}</p>
                      <p className="mt-1 text-caption text-app-muted">A: {preset.optionA} · B: {preset.optionB}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'form' && (
              <div>
                <div className="flex items-center gap-2">
                  {!initial && (
                    <IconButton aria-label={qt('cancel')} variant="ghost" size="sm" onClick={() => setMode(form.presetId ? 'presets' : 'choose')}>
                      <ArrowLeft className="h-5 w-5" />
                    </IconButton>
                  )}
                  <h2 className="text-title text-app">{initial ? qt('editQuestionTitle') : qt('newQuestionTitle')}</h2>
                </div>
                <textarea
                  value={form.questionText}
                  maxLength={160}
                  rows={2}
                  placeholder={qt('questionPlaceholder')}
                  onChange={(e) => { setForm((f) => ({ ...f, questionText: e.target.value })); setError(null); }}
                  className={cn(field, 'mt-4 resize-none')}
                  aria-label={qt('questionPlaceholder')}
                />
                <div className="mt-1 text-right text-[11px] text-app-muted">{form.questionText.trim().length}/160</div>
                {(['A', 'B'] as const).map((option) => {
                  const key = option === 'A' ? 'optionA' : 'optionB';
                  const isCorrect = form.correctOption === option;
                  return (
                    <div key={option} className="mt-3">
                      <label className="mb-1.5 block text-caption font-semibold text-app-muted">
                        {qt(option === 'A' ? 'optionALabel' : 'optionBLabel')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          value={form[key]}
                          maxLength={80}
                          placeholder={qt('optionPlaceholder')}
                          onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(null); }}
                          className={field}
                        />
                        <motion.button
                          type="button"
                          whileTap={{ scale: PRESS_SCALE }}
                          transition={SPRING.snappy}
                          onClick={() => { setForm((f) => ({ ...f, correctOption: option })); setError(null); }}
                          aria-pressed={isCorrect}
                          aria-label={`${qt('correctOptionLabel')} ${option}`}
                          className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                            isCorrect ? 'border-transparent bg-brand-gradient text-white' : 'border-app bg-surface text-app-muted'
                          )}
                        >
                          <Check className="h-5 w-5" />
                        </motion.button>
                      </div>
                    </div>
                  );
                })}
                <p className="mt-3 text-caption normal-case text-app-muted">
                  {qt('correctOptionLabel')}: {form.correctOption || '—'} · {qt('correctHint')}
                </p>
                {form.presetId && <p className="mt-1 text-caption normal-case text-app-muted">{qt('presetEditedHint')}</p>}
                {error && <p className="mt-3 text-caption font-semibold text-[#FF4B55]" role="alert">{qt(error)}</p>}
                <div className="mt-5 space-y-2.5">
                  <AppButton fullWidth size="lg" variant="primary" loading={submitting} onClick={() => void submit()}>
                    {qt('save')}
                  </AppButton>
                  <AppButton fullWidth size="md" variant="ghost" disabled={submitting} onClick={onClose}>
                    {qt('cancel')}
                  </AppButton>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
};

const ChoiceRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <motion.button
    type="button"
    whileTap={{ scale: PRESS_SCALE }}
    transition={SPRING.snappy}
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-2xl border border-app bg-surface-elevated p-4 text-left"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white">{icon}</span>
    <span className="text-body font-semibold text-app">{label}</span>
  </motion.button>
);

// ---------------------------------------------------------------------------------------------
// Question list rows
// ---------------------------------------------------------------------------------------------

interface QuestionRowData extends ProfileQuestionInput {
  key: string;
  status?: string;
}

interface QuestionListProps {
  items: QuestionRowData[];
  busy?: boolean;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

const QuestionList: React.FC<QuestionListProps> = ({ items, busy, onEdit, onDelete, onMove }) => {
  const { qt } = useQuestionText();
  const statusKey = (status?: string): QuestionTextKey | null =>
    status === 'PENDING_REVIEW' ? 'statusPending' : status === 'REJECTED' ? 'statusRejected' : status === 'ACTIVE' ? 'statusActive' : null;

  return (
    <motion.ul layout className="space-y-3">
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const sk = statusKey(item.status);
          return (
            <motion.li
              key={item.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={SPRING.soft}
              className="rounded-2xl border border-app bg-surface p-4"
              data-testid="profile-question-row"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-app-secondary text-caption font-bold text-app">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-app break-words">{item.questionText}</p>
                  <div className="mt-2 space-y-1">
                    {(['A', 'B'] as const).map((option) => (
                      <p
                        key={option}
                        className={cn(
                          'flex items-center gap-1.5 text-caption break-words',
                          item.correctOption === option ? 'font-semibold text-app' : 'text-app-muted'
                        )}
                      >
                        {item.correctOption === option && <Check className="h-3.5 w-3.5 shrink-0 text-[#32D583]" aria-hidden="true" />}
                        {option}: {option === 'A' ? item.optionA : item.optionB}
                      </p>
                    ))}
                  </div>
                  {sk && sk !== 'statusActive' && (
                    <p className="mt-2 text-caption font-semibold text-app-muted">
                      {qt(sk)} · {qt(item.status === 'REJECTED' ? 'rejectedHint' : 'pendingHint')}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1">
                <IconButton aria-label={qt('moveUp')} variant="ghost" size="sm" disabled={busy || index === 0} onClick={() => onMove(index, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton aria-label={qt('moveDown')} variant="ghost" size="sm" disabled={busy || index === items.length - 1} onClick={() => onMove(index, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton aria-label={qt('edit')} variant="ghost" size="sm" disabled={busy} onClick={() => onEdit(index)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton aria-label={qt('delete')} variant="ghost" size="sm" disabled={busy || items.length <= 1} onClick={() => onDelete(index)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
};

const DeleteConfirmModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void; loading?: boolean }> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
}) => {
  const { qt } = useQuestionText();
  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="p-6 text-center">
        <h2 className="text-title text-app">{qt('deleteConfirmTitle')}</h2>
        <p className="mt-2 text-caption normal-case leading-relaxed text-app-muted">{qt('deleteConfirmDescription')}</p>
        <div className="mt-6 flex gap-2">
          <AppButton fullWidth variant="secondary" disabled={loading} onClick={onClose}>{qt('cancel')}</AppButton>
          <AppButton fullWidth variant="danger" loading={loading} onClick={onConfirm}>{qt('delete')}</AppButton>
        </div>
      </div>
    </Modal>
  );
};

const AddQuestionButton: React.FC<{ count: number; onClick: () => void; disabled?: boolean }> = ({ count, onClick, disabled }) => {
  const { qt } = useQuestionText();
  const full = count >= MAX_PROFILE_QUESTIONS;
  return (
    <div className="mt-4">
      <AppButton
        fullWidth
        size="lg"
        variant={count === 0 ? 'primary' : 'secondary'}
        leftIcon={<Plus className="h-4 w-4" />}
        disabled={disabled || full}
        onClick={onClick}
      >
        {qt('addQuestion')}
      </AppButton>
      <p className="mt-2 text-center text-caption text-app-muted">
        {full ? qt('limitReached') : qt('countTemplate', { count, max: MAX_PROFILE_QUESTIONS })}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Draft editor (registration: nothing is persisted until /auth/register)
// ---------------------------------------------------------------------------------------------

export interface DraftProfileQuestion extends ProfileQuestionInput {
  key: string;
}

let draftSeq = 0;
function draftKey() {
  draftSeq += 1;
  return `draft-${Date.now().toString(36)}-${draftSeq}`;
}

export const ProfileQuestionsDraftEditor: React.FC<{
  value: DraftProfileQuestion[];
  onChange: (next: DraftProfileQuestion[]) => void;
}> = ({ value, onChange }) => {
  const { qt } = useQuestionText();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const initial = editingIndex !== null ? value[editingIndex] : null;

  const handleSubmit = (input: ProfileQuestionInput) => {
    const duplicate = value.some(
      (q, i) => i !== editingIndex && q.questionText.trim().toLocaleLowerCase() === input.questionText.toLocaleLowerCase()
    );
    if (duplicate) throw new ApiException(qt('errDuplicate'), 400, 'PROFILE_QUESTIONS_DUPLICATE');
    if (editingIndex !== null) {
      onChange(value.map((q, i) => (i === editingIndex ? { ...input, key: q.key } : q)));
    } else {
      onChange([...value, { ...input, key: draftKey() }].slice(0, MAX_PROFILE_QUESTIONS));
    }
    setFormOpen(false);
    setEditingIndex(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div data-testid="profile-questions-draft-editor">
      {value.length > 0 && (
        <QuestionList
          items={value}
          onEdit={(i) => { setEditingIndex(i); setFormOpen(true); }}
          onDelete={(i) => setDeleteIndex(i)}
          onMove={move}
        />
      )}
      {value.length === 0 && (
        <p className="rounded-2xl border border-dashed border-app p-4 text-center text-caption normal-case text-app-muted">
          {qt('requiredDescription')}
        </p>
      )}
      <AddQuestionButton count={value.length} onClick={() => { setEditingIndex(null); setFormOpen(true); }} />
      <ProfileQuestionFormSheet
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingIndex(null); }}
        initial={initial}
        onSubmit={handleSubmit}
      />
      <DeleteConfirmModal
        isOpen={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex !== null) onChange(value.filter((_, i) => i !== deleteIndex));
          setDeleteIndex(null);
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Server-backed manager (Profil -> Profili Duzenle -> Profil Sorularim, and the discover gate)
// ---------------------------------------------------------------------------------------------

function toRow(q: OwnProfileQuestion): QuestionRowData {
  return {
    key: q.id,
    questionText: q.questionText,
    optionA: q.optionA,
    optionB: q.optionB,
    correctOption: q.correctOption,
    presetId: q.presetId,
    status: q.status,
  };
}

export const ProfileQuestionsManager: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {

  const { qt } = useQuestionText();
  const query = useOwnProfileQuestionsQuery();
  const createMutation = useCreateProfileQuestionMutation();
  const updateMutation = useUpdateProfileQuestionMutation();
  const deleteMutation = useDeleteProfileQuestionMutation();
  const reorderMutation = useReorderProfileQuestionsMutation();
  const [editing, setEditing] = useState<OwnProfileQuestion | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnProfileQuestion | null>(null);

  const questions = useMemo(() => query.data?.questions || [], [query.data]);
  const rows = useMemo(() => questions.map(toRow), [questions]);
  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;

  const initial = useMemo<ProfileQuestionInput | null>(
    () =>
      editing
        ? { questionText: editing.questionText, optionA: editing.optionA, optionB: editing.optionB, correctOption: editing.correctOption, presetId: editing.presetId }
        : null,
    [editing]
  );

  const handleSubmit = async (input: ProfileQuestionInput) => {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, input });
    } else {
      await createMutation.mutateAsync(input);
    }
    toast.success(qt('savedToast'));
    setFormOpen(false);
    setEditing(null);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(qt('deletedToast'));
      onChanged?.();
    } catch (err) {
      toast.error(qt(questionErrorKey(err instanceof ApiException ? err.code : null)));
    } finally {
      setDeleteTarget(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const ids = questions.map((q) => q.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderMutation.mutateAsync(ids);
    } catch (err) {
      toast.error(qt(questionErrorKey(err instanceof ApiException ? err.code : null)));
    }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <Skeleton key={i} variant="card" className="h-28" />)}
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState title={qt('errGeneric')} onRetry={() => void query.refetch()} />;
  }

  return (
    <div data-testid="profile-questions-manager">
      <p className="mb-4 text-caption normal-case leading-relaxed text-app-muted">{qt('editorDescription')}</p>
      {rows.length > 0 && (
        <QuestionList
          items={rows}
          busy={busy}
          onEdit={(i) => { setEditing(questions[i]); setFormOpen(true); }}
          onDelete={(i) => setDeleteTarget(questions[i])}
          onMove={(i, d) => void move(i, d)}
        />
      )}
      {rows.length === 1 && <p className="mt-2 text-center text-caption text-app-muted">{qt('lastQuestionHint')}</p>}
      <AddQuestionButton count={rows.length} disabled={busy} onClick={() => { setEditing(null); setFormOpen(true); }} />
      <ProfileQuestionFormSheet
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={initial}
        onSubmit={handleSubmit}
        submitting={createMutation.isPending || updateMutation.isPending}
      />
      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        loading={deleteMutation.isPending}
      />
    </div>
  );
};
