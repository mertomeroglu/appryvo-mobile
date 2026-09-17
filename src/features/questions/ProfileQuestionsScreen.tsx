import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { IconButton } from '../../components/ui/IconButton';
import { useAppTranslation } from '../../i18n/appLocale';
import { ProfileQuestionsManager } from './ProfileQuestionsEditor';
import { useQuestionText } from './questionLocale';

/** Profil -> Profili Duzenle -> Profil Sorularim, and where the discover gate sends people. */
export const ProfileQuestionsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { qt } = useQuestionText();

  return (
    <div className="flex h-full flex-col bg-app text-app">
      <ScreenHeader
        title={qt('editorTitle')}
        leading={
          <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
      />
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <ProfileQuestionsManager />
      </main>
    </div>
  );
};

export default ProfileQuestionsScreen;
