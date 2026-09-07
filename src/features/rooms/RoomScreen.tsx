import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Heart, Mic, MoreHorizontal, Reply, Send, ShieldCheck, Users,
  Smile, Star, X, ShieldAlert, UserX,
} from 'lucide-react';
import { communityRoomsService, type CommunityRoom, type RoomMessage, type RoomParticipant, type Sticker } from '../../services/rooms/communityRoomsService';
import { ConnectButton } from '../connect/ConnectButton';
import { socketService } from '../../services/socket/socketService';
import { mediaService } from '../../services/media/mediaService';
import { apiClient } from '../../services/api/apiClient';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppTranslation } from '../../i18n/appLocale';
import { roomsText } from './roomsLocale';
import { connectText } from '../connect/connectLocale';
import { Avatar } from '../../components/ui/Avatar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { AppButton } from '../../components/ui/AppButton';
import { FollowButton } from '../../components/FollowButton';
import { createAudioRecorder, recorderBlob, stopMediaStream } from '../../services/media/audioRecorder';
import { randomUuid } from '../../lib/utils';

// Ryvo Community Rooms V3: text-only forever -- no live voice/video room UI here any more (the
// old mesh-WebRTC room-call service was deleted outright). Voice is a recorded MESSAGE,
// mirroring ChatScreen.tsx's own record -> upload -> send('AUDIO') pipeline exactly.

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const MembersSheet: React.FC<{
  open: boolean; close: () => void; members: RoomParticipant[]; locale: any; meId?: string;
  onSelect: (member: RoomParticipant) => void;
}> = ({ open, close, members, locale, meId, onSelect }) => (
  <BottomSheet isOpen={open} onClose={close}>
    <div className="max-h-[65vh] overflow-y-auto px-5 pb-6">
      <h2 className="mb-4 text-heading">{roomsText(locale, 'members')}</h2>
      {members.map((m) => (
        <button
          key={m.id}
          onClick={() => (m.id !== meId ? onSelect(m) : undefined)}
          className="flex w-full items-center gap-3 border-b border-app py-3 text-start"
        >
          <Avatar src={m.photoUrl} name={m.name} size="sm" />
          <div className="flex-1">
            <b>{m.name}</b>
            <p className="text-caption text-app-muted">{m.role}</p>
          </div>
          {m.role !== 'MEMBER' && <ShieldCheck className="text-amber-400" />}
        </button>
      ))}
    </div>
  </BottomSheet>
);

const MemberProfileSheet: React.FC<{
  member: RoomParticipant | null; close: () => void; locale: any; roomId?: string;
}> = ({ member, close, locale, roomId }) => {
  const navigate = useNavigate();
  if (!member) return null;

  return (
    <BottomSheet isOpen={!!member} onClose={close}>
      <div className="space-y-4 px-5 pb-6">
        <div className="flex items-center gap-3">
          <Avatar src={member.photoUrl} name={member.name} size="lg" />
          <div>
            <h2 className="text-heading flex items-center gap-1">{member.name}{member.verified && <ShieldCheck className="h-4 w-4 text-[#25D9D0]" />}</h2>
            <p className="text-caption text-app-muted">{member.role}</p>
          </div>
        </div>

        <div className="space-y-2">
          <AppButton fullWidth variant="secondary" onClick={() => { close(); navigate(`/discover/${member.id}`); }}>
            {connectText(locale, 'viewProfile')}
          </AppButton>
          <FollowButton userId={member.id} className="w-full" />
          <ConnectButton userId={member.id} locale={locale} sourceType="ROOM" sourceRoomId={roomId} />
          <div className="flex gap-2 pt-1">
            <AppButton fullWidth variant="secondary" leftIcon={<ShieldAlert className="w-4 h-4" />} onClick={() => {
              apiClient.post(`/api/rooms/${roomId}/report`, { targetType: 'USER', reason: 'OTHER', reportedUserId: member.id }).catch(() => {});
              close();
            }}>{connectText(locale, 'report')}</AppButton>
            <AppButton fullWidth variant="danger" leftIcon={<UserX className="w-4 h-4" />} onClick={() => {
              apiClient.post('/api/blocks', { targetUserId: member.id }).catch(() => {});
              close();
            }}>{connectText(locale, 'block')}</AppButton>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};

const StickerSheet: React.FC<{ open: boolean; close: () => void; onPick: (id: string) => void; locale: any }> = ({ open, close, onPick, locale }) => {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  useEffect(() => { if (open) communityRoomsService.stickers().then(setStickers).catch(() => setStickers([])); }, [open]);
  return (
    <BottomSheet isOpen={open} onClose={close}>
      <div className="px-5 pb-6">
        <h2 className="mb-4 text-heading">{roomsText(locale, 'stickerPicker')}</h2>
        <div className="grid grid-cols-4 gap-3">
          {stickers.map((s) => (
            <button key={s.id} onClick={() => { onPick(s.id); close(); }} className="flex aspect-square items-center justify-center rounded-2xl border border-app bg-surface text-4xl active:scale-90 transition-transform">
              {s.emoji}
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
};

export const RoomScreen: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { locale } = useAppTranslation();
  const me = useAuthStore((s) => s.user);
  const [room, setRoom] = useState<CommunityRoom | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [members, setMembers] = useState<RoomParticipant[]>([]);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<RoomMessage | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<RoomParticipant | null>(null);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [highlightNext, setHighlightNext] = useState(false);
  const [sendingHighlight, setSendingHighlight] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<Record<string, number>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingMountedRef = useRef(true);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let active = true;
    const refreshMessages = () => communityRoomsService.messages(roomId).then((m) => { if (active) setMessages(m); }).catch((e: any) => { if (active) setError(e?.code || e?.message); });
    communityRoomsService.join(roomId)
      .then((r) => Promise.all([Promise.resolve(r), communityRoomsService.messages(roomId), communityRoomsService.members(roomId)]))
      .then(([r, m, u]) => { if (active) { setRoom(r); setMessages(m); setMembers(u); socketService.subscribeRoom(roomId); } })
      .catch((e: any) => setError(e?.code || e?.message));
    const offM = socketService.on('room:message', (m: RoomMessage) => { if (m.roomId === roomId) void refreshMessages(); });
    const offR = socketService.on('room:reaction', (p: any) => { if (p.roomId === roomId) void refreshMessages(); });
    return () => { active = false; offM(); offR(); socketService.unsubscribeRoom(roomId); };
  }, [roomId]);

  // The braces matter. On current Chromium, scrollIntoView({ behavior: 'smooth' }) returns a
  // Promise, so an expression-bodied arrow hands React that Promise as the effect cleanup. React
  // calls the cleanup when the subtree is deleted -- which is exactly what leaving a room does --
  // and crashed the whole route with "is not a function".
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  useEffect(() => () => {
    recordingMountedRef.current = false;
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    stopMediaStream(mediaRecorderRef.current?.stream);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingMountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      const recorder = createAudioRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (error) {
      console.error('[COMMUNITY ROOM AUDIO] recording start failed', error);
      setError(roomsText(locale, 'permissionDenied'));
    }
  };

  const stopRecording = (send: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const duration = recordSeconds;
    recorder.onstop = async () => {
      stopMediaStream(recorder.stream);
      mediaRecorderRef.current = null;
      setIsRecording(false);
      if (!send || chunksRef.current.length === 0 || !roomId || duration <= 0) return;
      const blob = recorderBlob(chunksRef.current, recorder);
      try {
        const res = await mediaService.uploadMedia(blob, 'voice');
        if (res?.data?.url) {
          socketService.emit('room:message:send', {
            roomId, messageType: 'AUDIO', mediaUrl: res.data.url, durationSeconds: duration,
            clientMessageId: `room-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            replyToMessageId: reply?.id || null,
          }, (r: any) => { if (r.status !== 'success') setError(r.code); });
          setReply(null);
        }
      } catch (error) {
        console.error('[COMMUNITY ROOM AUDIO] upload/send failed', error);
        setError('AUDIO_UPLOAD_FAILED');
      }
    };
    if (recorder.state !== 'inactive') recorder.stop();
  };

  const sendSticker = (stickerId: string) => {
    if (!roomId) return;
    socketService.emit('room:message:send', {
      roomId, messageType: 'STICKER', stickerId,
      clientMessageId: `room-sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      replyToMessageId: reply?.id || null,
    }, (r: any) => { if (r.status !== 'success') setError(r.code); });
    setReply(null);
  };

  const send = async () => {
    if (!roomId || !text.trim()) return;
    const body = text.trim();
    if (highlightNext) {
      setSendingHighlight(true);
      setError('');
      try {
        await communityRoomsService.sendHighlighted(roomId, body, `room-highlight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        setText('');
        setHighlightNext(false);
        setReply(null);
      } catch (e: any) {
        setError(e?.response?.data?.code === 'INSUFFICIENT_COINS' ? roomsText(locale, 'insufficientCoins') : e?.message || 'Error');
      } finally {
        setSendingHighlight(false);
      }
      return;
    }
    const clientMessageId = randomUuid();
    setText('');
    socketService.emit('room:message:send', { roomId, text: body, clientMessageId, replyToMessageId: reply?.id || null }, (r: any) => {
      if (r.status !== 'success') setError(r.code);
    });
    setReply(null);
  };

  const react = (m: RoomMessage) => {
    if (!roomId) return;
    const mine = m.reactions.some((r) => r.userId === me?.id && r.reaction === 'heart');
    socketService.emit('room:reaction:set', { roomId, messageId: m.id, reaction: mine ? null : 'heart' });
  };
  const tap = (m: RoomMessage) => {
    const now = Date.now();
    if (now - (lastTap.current[m.id] || 0) < 360) react(m);
    lastTap.current[m.id] = now;
  };
  const leave = async () => {
    if (!roomId) { navigate('/map', { replace: true }); return; }
    try {
      await communityRoomsService.leave(roomId);
    } catch (e: any) {
      // Staying put is the honest outcome -- navigating away would tell the user they left a room
      // the server still counts them in.
      setShowMenu(false);
      setError(e?.response?.data?.code || e?.message || 'Error');
      return;
    }
    navigate('/map', { replace: true });
  };

  if (!room) return <div className="flex h-full items-center justify-center bg-app text-app-muted">{error || '•••'}</div>;

  return (
    <div className="flex h-full flex-col bg-app text-app">
      <header className="flex items-center gap-3 border-b border-app bg-surface-95 px-4 pb-3 pt-safe backdrop-blur-xl">
        <button onClick={() => navigate(-1)} className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><ArrowLeft className="h-5 w-5" /></button>
        <div className="mt-3 min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h1 className="truncate text-body font-extrabold">{room.title}</h1>
            {room.isOfficial && <ShieldCheck className="h-4 w-4 text-[#25D9D0]" />}
          </div>
          <p className="text-caption text-app-muted">{room.city} · {members.length} {roomsText(locale, 'participants')}</p>
        </div>
        <button onClick={() => setShowMembers(true)} className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><Users className="h-5 w-5" /></button>
        <button onClick={() => setShowMenu(true)} className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><MoreHorizontal className="h-5 w-5" /></button>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            onClick={() => tap(m)}
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => { if (touch.current && e.changedTouches[0].clientX - touch.current.x > 55) setReply(m); touch.current = null; }}
            className={`flex gap-2 ${m.senderId === me?.id ? 'flex-row-reverse' : ''}`}
          >
            <Avatar src={m.sender.photoUrl} name={m.sender.name} size="xs" />
            <div className={`max-w-[78%] rounded-[20px] px-4 py-3 ${
              m.isHighlighted ? 'border-2 border-amber-400 bg-amber-400/10 text-app' :
              m.senderId === me?.id ? 'bg-brand-gradient text-white' : 'border border-app bg-surface text-app'
            }`}>
              {m.isHighlighted && (
                <div className="mb-1 flex items-center gap-1 text-[11px] font-extrabold text-amber-500"><Star className="h-3 w-3 fill-current" /> {roomsText(locale, 'highlightMessage')}</div>
              )}
              {m.replyPreview && (
                <div className="mb-2 rounded-xl border-s-2 border-pink-400 bg-black/10 px-3 py-2 text-caption">
                  <b>{m.replyPreview.senderName}</b>
                  <p className="truncate opacity-75">{m.replyPreview.unavailable ? roomsText(locale, 'unavailableMessage') : m.replyPreview.text}</p>
                </div>
              )}
              <div className="mb-1 text-[11px] font-extrabold opacity-70">{m.sender.name}{m.isSystem ? ' · Ryvo' : ''}</div>
              {m.messageType === 'AUDIO' && m.mediaUrl ? (
                <audio controls src={m.mediaUrl} className="h-9 max-w-full" />
              ) : m.messageType === 'STICKER' && m.stickerId ? (
                <StickerBubble stickerId={m.stickerId} />
              ) : (
                <p className="whitespace-pre-wrap text-body">{m.text}</p>
              )}
              {m.reactions.length > 0 && (
                <span className="mt-1 inline-flex rounded-full bg-surface px-2 py-0.5 text-xs text-pink-500 shadow-soft">
                  <Heart className="me-1 h-3 w-3 fill-current" />{m.reactions.length}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </main>

      {reply && (
        <div className="mx-4 flex items-center gap-3 rounded-t-2xl border border-app bg-surface px-4 py-2">
          <Reply className="text-pink-500" />
          <div className="min-w-0 flex-1 text-caption"><b>{reply.sender.name}</b><p className="truncate text-app-muted">{reply.text || reply.messageType}</p></div>
          <button onClick={() => setReply(null)}>×</button>
        </div>
      )}

      {error && <p className="mx-4 text-caption font-bold text-red-500">{error}</p>}

      {isRecording ? (
        <footer className="flex items-center gap-3 border-t border-app bg-surface px-4 pb-[calc(var(--safe-bottom)+.75rem)] pt-3">
          <span className="flex-1 text-body font-bold text-red-500">{roomsText(locale, 'recording')} {formatSeconds(recordSeconds)}</span>
          <button onClick={() => stopRecording(false)} className="flex h-12 w-12 items-center justify-center rounded-full bg-app-secondary"><X /></button>
          <button onClick={() => stopRecording(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white"><Send className="h-5 w-5" /></button>
        </footer>
      ) : (
        <footer className="border-t border-app bg-surface px-4 pb-[calc(var(--safe-bottom)+.75rem)] pt-3">
          {text.trim() && (
            <label className="mb-2 flex items-center gap-2 text-caption font-bold text-amber-600">
              <input type="checkbox" checked={highlightNext} onChange={(e) => setHighlightNext(e.target.checked)} className="accent-amber-500" />
              <Star className="h-3.5 w-3.5" /> {roomsText(locale, 'highlightCostLabel')}
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowStickers(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-app-secondary"><Smile /></button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={roomsText(locale, 'writeMessage')}
              className="h-12 min-w-0 flex-1 rounded-full bg-app-secondary px-5 outline-none focus:ring-2 focus:ring-pink-500"
            />
            {text.trim() ? (
              <button onClick={send} disabled={sendingHighlight} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white disabled:opacity-40"><Send className="h-5 w-5" /></button>
            ) : (
              <button onClick={startRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-white"><Mic /></button>
            )}
          </div>
        </footer>
      )}

      <MembersSheet open={showMembers} close={() => setShowMembers(false)} members={members} locale={locale} meId={me?.id} onSelect={(m) => { setShowMembers(false); setSelectedMember(m); }} />
      <MemberProfileSheet member={selectedMember} close={() => setSelectedMember(null)} locale={locale} roomId={roomId} />
      <StickerSheet open={showStickers} close={() => setShowStickers(false)} onPick={sendSticker} locale={locale} />
      <BottomSheet isOpen={showMenu} onClose={() => setShowMenu(false)}>
        <div className="space-y-3 px-5 pb-6">
          <h2 className="text-heading">{room.title}</h2>
          <AppButton fullWidth variant="secondary" onClick={() => communityRoomsService.report(room.id, { targetType: 'ROOM', reason: 'OTHER' }).then(() => setShowMenu(false)).catch((e: any) => { setShowMenu(false); setError(e?.response?.data?.code || e?.message || 'Error'); })}>{roomsText(locale, 'report')}</AppButton>
          <AppButton fullWidth variant="danger" onClick={leave}>{roomsText(locale, 'leave')}</AppButton>
        </div>
      </BottomSheet>
    </div>
  );
};

// Sticker catalog is fetched from the server (single source of truth, matches
// stickers_catalog.js) -- this bubble just looks up the emoji for the id already on the message
// DTO so a room replay doesn't need a second round trip per message.
const STICKER_EMOJI_CACHE: Record<string, string> = {};
const StickerBubble: React.FC<{ stickerId: string }> = ({ stickerId }) => {
  const [emoji, setEmoji] = useState(STICKER_EMOJI_CACHE[stickerId] || '');
  useEffect(() => {
    if (STICKER_EMOJI_CACHE[stickerId]) return;
    communityRoomsService.stickers().then((list) => {
      list.forEach((s) => { STICKER_EMOJI_CACHE[s.id] = s.emoji; });
      setEmoji(STICKER_EMOJI_CACHE[stickerId] || '❔');
    }).catch(() => setEmoji('❔'));
  }, [stickerId]);
  return <span className="text-5xl leading-none">{emoji || '…'}</span>;
};

export default RoomScreen;
