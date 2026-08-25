import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useStoriesQuery } from '../hooks/useQueries';
import { useAuthStore } from '../stores/useAuthStore';
import { normalizeMediaUrl } from '../services/media/mediaService';
import { getPhotoUrl } from '../services/media/mediaService';
import { Avatar } from './ui/Avatar';
import { StoryViewer } from './StoryViewer';
import { StoryComposer } from './StoryComposer';
import { useAppTranslation } from '../i18n/appLocale';

/** Social layer at the top of the Messages hub (not a bottom-nav tab): own story / "Hikaye Ekle"
 * first, then organic stories from followed users, then any promoted ("Sponsorlu") placements --
 * both already scoped and ordered server-side (see GET /api/social/stories). */
export const StoryTray: React.FC = () => {
  const { t } = useAppTranslation();
  const user = useAuthStore((s) => s.user);
  const { data } = useStoriesQuery();
  const stories = useMemo(() => data?.items || [], [data?.items]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const ownStory = stories.find((s) => s.isOwn);
  const otherStories = stories.filter((s) => !s.isOwn);

  const openViewerFor = (storyId: string) => {
    const idx = stories.findIndex((s) => s.id === storyId);
    if (idx >= 0) setViewerIndex(idx);
  };

  return (
    <>
      <div className="shrink-0 px-4 pb-2 overflow-x-auto no-scrollbar">
        <div className="flex items-start gap-3 w-max">
          {/* Own story / add-story bubble -- always first, always present regardless of whether
              the tray has any organic stories to show. */}
          <button
            type="button"
            onClick={() => (ownStory ? openViewerFor(ownStory.id) : setComposerOpen(true))}
            className="w-16 flex flex-col items-center gap-1 active:scale-95 transition-transform"
          >
            <span className="relative block">
              <span className={`p-[2px] rounded-full block ${ownStory && !ownStory.viewedByMe ? 'bg-brand-gradient' : ownStory ? 'bg-app-secondary' : 'bg-transparent'}`}>
                <span className="block p-[2px] rounded-full bg-app">
                  <Avatar src={getPhotoUrl(user?.photos?.[0]) ? normalizeMediaUrl(getPhotoUrl(user?.photos?.[0])) : undefined} name={user?.name} size="md" />
                </span>
              </span>
              <span
                role="button"
                aria-label={t('storyAddLabel')}
                onClick={(e) => { e.stopPropagation(); setComposerOpen(true); }}
                className="absolute -bottom-0.5 -end-0.5 w-5 h-5 rounded-full bg-brand-gradient border-2 border-app flex items-center justify-center before:absolute before:-inset-2 before:content-['']"
              >
                <Plus className="w-3 h-3 text-white" strokeWidth={3} />
              </span>
            </span>
            <span className="w-full text-micro font-bold text-app truncate normal-case">
              {ownStory ? t('myStoryLabel') : t('storyAddLabel')}
            </span>
          </button>

          {otherStories.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => openViewerFor(story.id)}
              className="w-16 flex flex-col items-center gap-1 active:scale-95 transition-transform"
            >
              <span
                className={`p-[2px] rounded-full block shadow-soft ${
                  story.isPromoted
                    ? 'bg-gradient-to-tr from-amber-400 to-amber-500'
                    : story.viewedByMe
                      ? 'bg-app-secondary'
                      : 'bg-brand-gradient'
                }`}
              >
                <span className="block p-[2px] rounded-full bg-app">
                  <Avatar src={story.userPhoto ? normalizeMediaUrl(story.userPhoto) : undefined} name={story.userName} size="md" />
                </span>
              </span>
              <span className="w-full text-micro font-bold text-app truncate normal-case">{story.userName}</span>
              {story.isPromoted && (
                <span className="rounded-full bg-amber-400/20 px-1.5 py-0 text-[8px] font-extrabold uppercase text-amber-600">{t('sponsoredLabel')}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {viewerIndex != null && stories[viewerIndex] && (
        <StoryViewer stories={stories} startIndex={viewerIndex} selfId={user?.id} onClose={() => setViewerIndex(null)} />
      )}

      <StoryComposer isOpen={composerOpen} onClose={() => setComposerOpen(false)} onPublished={() => setComposerOpen(false)} />
    </>
  );
};
