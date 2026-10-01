import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { useSocialText } from './socialLocale';

interface ConnectionMadeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  person?: { name?: string; photoUrl?: string | null } | null;
  /** The conversation id (a `matches` row on the server). Without it only "later" is offered. */
  conversationId?: string | null;
}

/**
 * Shown when a question owner accepts an answer and a mutual connection is created. It is a
 * plain confirmation with a way into the conversation -- no celebration screen, no hearts.
 */
export const ConnectionMadeSheet: React.FC<ConnectionMadeSheetProps> = ({ isOpen, onClose, person, conversationId }) => {
  const navigate = useNavigate();
  const { st } = useSocialText();
  const name = person?.name || '';

  const startChat = () => {
    onClose();
    if (conversationId) navigate(`/chat/${conversationId}`);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4 px-5 pb-6 text-center" data-testid="connection-made-sheet">
        <div className="flex justify-center">
          <Avatar src={person?.photoUrl || undefined} name={name} size="lg" className="rounded-full" />
        </div>
        <div className="space-y-1">
          <h2 className="text-heading text-app">{st('connectionMadeTitle')}</h2>
          {name && <p className="text-body text-app-muted">{st('connectionMadeBodyTemplate', { name })}</p>}
        </div>
        <div className="grid gap-2">
          {conversationId && (
            <AppButton onClick={startChat} fullWidth>
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {st('startChatAction')}
            </AppButton>
          )}
          <AppButton variant="secondary" onClick={onClose} fullWidth>
            {st('laterAction')}
          </AppButton>
        </div>
      </div>
    </BottomSheet>
  );
};
