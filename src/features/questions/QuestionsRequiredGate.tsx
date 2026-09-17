import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { useQuestionText } from './questionLocale';

/**
 * Blocking state for every discovery surface when /me reports questionsRequired (including
 * OAuth accounts that registered before profile questions existed). Nothing is fetched or
 * answered until the person owns at least one active question.
 */
export const QuestionsRequiredGate: React.FC<{ className?: string }> = ({ className }) => {
  const navigate = useNavigate();
  const { qt } = useQuestionText();

  return (
    <EmptyState
      className={className}
      icon={<HelpCircle className="h-8 w-8" aria-hidden="true" />}
      title={qt('requiredTitle')}
      subtitle={qt('requiredDescription')}
      actionLabel={qt('requiredAction')}
      onAction={() => navigate('/profile/questions')}
    />
  );
};
