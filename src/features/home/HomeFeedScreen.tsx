import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, BadgeCheck, ChevronRight, HelpCircle, MessagesSquare, Plus, Sparkles, Users } from 'lucide-react';
import { AppLogo } from '../../components/ui/AppLogo';
import { IconButton } from '../../components/ui/IconButton';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StoryTray } from '../../components/StoryTray';
import { useInAppNotificationsQuery } from '../../hooks/useQueries';
import { useQuestionFeedQuery, type QuestionFeedItem } from '../../hooks/useQuestionQueries';
import { communityRoomsService, type CommunityRoom } from '../../services/rooms/communityRoomsService';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { useAppTranslation } from '../../i18n/appLocale';
import { QuestionAnswerSheet, type QuestionAnswerTarget } from '../questions/QuestionAnswerSheet';
import { useSocialText } from '../social/socialLocale';

const HOME_ROOMS_LIMIT = 8;

/**
 * Default authenticated landing screen. Content comes first: stories, questions people asked the
 * community, live rooms and the confessions board. There is no person-by-person card deck, no
 * distance, age or compatibility score -- a question card shows who asked it, their city and what
 * the viewer has in common with them (shared interests / communities).
 */
export const HomeFeedScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { st } = useSocialText();
  const [answerTarget, setAnswerTarget] = useState<QuestionAnswerTarget | null>(null);
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());

  const { data: notificationsData } = useInAppNotificationsQuery();
  const unreadNotificationCount = notificationsData?.unreadCount || 0;

  const feed = useQuestionFeedQuery();
  const questions = useMemo(() => (feed.data?.pages || []).flatMap((page) => page.items || []), [feed.data]);
  const questionsRequired = feed.data?.pages?.[0]?.questionsRequired === true;

  const rooms = useQuery({
    queryKey: ['rooms', 'home', 'v1'],
    queryFn: () => communityRoomsService.list(),
    staleTime: 60_000,
  });
  const liveRooms: CommunityRoom[] = useMemo(() => (rooms.data || []).slice(0, HOME_ROOMS_LIMIT), [rooms.data]);

  const openAnswer = (item: QuestionFeedItem) => {
    setAnswerTarget({ id: item.author.id, name: item.author.name, questionId: item.questionId });
  };

  const questionSection = () => {
    if (feed.isLoading) {
      return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} variant="card" className="h-40" />)}</div>;
    }
    if (feed.isError) {
      return <ErrorState title={st('homeLoadError')} onRetry={() => void feed.refetch()} />;
    }
    if (questionsRequired) {
      return (
        <EmptyState
          icon={<HelpCircle className="h-8 w-8" aria-hidden="true" />}
          title={st('homeQuestionsRequiredTitle')}
          subtitle={st('homeQuestionsRequiredBody')}
          actionLabel={st('homeAddQuestionAction')}
          onAction={() => navigate('/profile/questions')}
        />
      );
    }
    if (questions.length === 0) {
      return (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" aria-hidden="true" />}
          title={st('homeQuestionsEmptyTitle')}
          subtitle={st('homeQuestionsEmptyBody')}
        />
      );
    }
    return (
      <div className="space-y-3">
        <ul className="space-y-3">
          {questions.map((item) => {
            const photo = item.author.photoThumbnailUrl ? normalizeMediaUrl(item.author.photoThumbnailUrl) : undefined;
            const isAnswered = answered.has(item.questionId) || !item.canAnswer;
            return (
              <li key={item.questionId} className="rounded-3xl border border-app bg-surface p-4" data-testid="home-question-card">
                <button
                  type="button"
                  onClick={() => navigate(`/discover/${item.author.id}`)}
                  className="flex w-full items-center gap-3 text-start"
                >
                  <Avatar src={photo} name={item.author.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-caption font-bold text-app">
                      {st('askedByTemplate', { name: item.author.name })}
                      {item.author.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden="true" />}
                    </p>
                    {item.author.city && <p className="truncate text-micro text-app-muted">{item.author.city}</p>}
                  </div>
                </button>
                <p className="mt-3 text-body font-bold normal-case leading-snug text-app">{item.questionText}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-caption normal-case">
                  <span className="truncate rounded-2xl bg-surface-elevated px-3 py-2 text-app-muted">{item.optionA}</span>
                  <span className="truncate rounded-2xl bg-surface-elevated px-3 py-2 text-app-muted">{item.optionB}</span>
                </div>
                {(item.sharedInterestCount > 0 || item.sharedCommunityCount > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-micro font-semibold text-app-muted">
                    {item.sharedInterestCount > 0 && (
                      <span className="rounded-full bg-surface-elevated px-2.5 py-1" title={(item.sharedInterests || []).join(', ')}>
                        {st('sharedInterestsTemplate', { count: item.sharedInterestCount })}
                      </span>
                    )}
                    {item.sharedCommunityCount > 0 && (
                      <span className="rounded-full bg-surface-elevated px-2.5 py-1">
                        {st('sharedCommunitiesTemplate', { count: item.sharedCommunityCount })}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-3">
                  {isAnswered ? (
                    <p className="text-caption font-semibold text-app-muted">{st('answeredLabel')}</p>
                  ) : (
                    <AppButton size="sm" variant="primary" onClick={() => openAnswer(item)}>
                      {st('answerAction')}
                    </AppButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {feed.hasNextPage && (
          <AppButton
            variant="secondary"
            fullWidth
            loading={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {st('homeLoadMore')}
          </AppButton>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col bg-app text-app">
      <header className="pt-safe z-sticky flex min-h-[calc(4rem+var(--safe-top))] items-center justify-between bg-app-80 px-4 backdrop-blur-md">
        <AppLogo variant="icon" size="md" />
        <IconButton aria-label={t('notifications')} variant="surface" size="md" onClick={() => navigate('/notifications')} className="relative">
          <Bell className="h-5 w-5" />
          {unreadNotificationCount > 0 && (
            <span className="absolute -top-1 -end-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-app bg-brand-gradient px-1 text-[10px] font-extrabold text-white">
              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
            </span>
          )}
        </IconButton>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto pb-28" data-testid="home-feed">
        <StoryTray />

        <section className="space-y-3 px-4" aria-labelledby="home-rooms-title">
          <div className="flex items-center justify-between">
            <h2 id="home-rooms-title" className="text-heading text-app">{st('homeRoomsTitle')}</h2>
            <button type="button" onClick={() => navigate('/map')} className="flex items-center gap-0.5 text-caption font-bold text-brand-primary">
              {st('homeSeeAll')}
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
          {rooms.isLoading ? (
            <div className="flex gap-3 overflow-hidden">{[0, 1, 2].map((i) => <Skeleton key={i} variant="card" className="h-28 w-44 shrink-0" />)}</div>
          ) : liveRooms.length === 0 ? (
            <button
              type="button"
              onClick={() => navigate('/rooms/create')}
              className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-app bg-surface p-4 text-start"
            >
              <Plus className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden="true" />
              <span className="text-caption font-semibold normal-case text-app-muted">{st('homeRoomsEmpty')}</span>
            </button>
          ) : (
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1" data-testid="home-rooms-strip">
              {liveRooms.map((room) => (
                <li key={room.id} className="w-44 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                    className="flex h-28 w-full flex-col justify-between rounded-3xl border border-app bg-surface p-3 text-start"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-caption font-bold normal-case text-app">{room.title}</p>
                      <p className="truncate text-micro text-app-muted">{room.city}</p>
                    </div>
                    <span className="flex items-center gap-1 text-micro font-semibold text-app-muted">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      {room.activeParticipantCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 px-4" aria-labelledby="home-questions-title">
          <div>
            <h2 id="home-questions-title" className="text-heading text-app">{st('homeQuestionsTitle')}</h2>
            <p className="text-caption normal-case text-app-muted">{st('homeQuestionsSubtitle')}</p>
          </div>
          {questionSection()}
        </section>

        <section className="px-4">
          <button
            type="button"
            onClick={() => navigate('/messages?tab=confessions')}
            className="flex w-full items-center gap-3 rounded-3xl border border-app bg-surface p-4 text-start"
            data-testid="home-confessions-card"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white">
              <MessagesSquare className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-bold text-app">{st('homeConfessionsTitle')}</span>
              <span className="block text-caption normal-case text-app-muted">{st('homeConfessionsSubtitle')}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-app-muted rtl:rotate-180" aria-hidden="true" />
          </button>
        </section>
      </main>

      <QuestionAnswerSheet
        isOpen={answerTarget !== null}
        onClose={() => setAnswerTarget(null)}
        target={answerTarget}
        onOutcome={(outcome) => {
          const questionId = answerTarget?.questionId;
          if (questionId && outcome !== 'UNAVAILABLE') {
            setAnswered((prev) => new Set(prev).add(questionId));
          }
        }}
        onQuestionsRequired={() => navigate('/profile/questions')}
      />
    </div>
  );
};

export default HomeFeedScreen;
