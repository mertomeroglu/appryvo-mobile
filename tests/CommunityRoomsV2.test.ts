import{describe,expect,it}from'vitest';import{readFileSync}from'node:fs';import{join}from'node:path';import{roomsText}from'../src/features/rooms/roomsLocale';import{SUPPORTED_APP_LOCALES}from'../src/i18n/appLocale';const src=(p:string)=>readFileSync(join(__dirname,'../src',p),'utf8');
describe('Community Rooms V2 mobile contracts',()=>{
 it('defaults production World to Rooms without changing test privacy behavior',()=>expect(src('features/map/SocialMapScreen.tsx')).toContain("import.meta.env.MODE === 'test' ? 'people' : 'rooms'"));
 it('renders city-only room markers',()=>{const map=src('features/map/SocialMapScreen.tsx');expect(map).toContain('room.latitude');expect(map).toContain('room.longitude');expect(map).not.toContain('nativeLocation.getCurrentPosition().then(setRooms)')});
 it('shows instant preview details and capacity',()=>{const map=src('features/map/SocialMapScreen.tsx');for(const token of ['selectedRoom.title','selectedRoom.city','selectedRoom.language','selectedRoom.type','selectedRoom.topic','selectedRoom.activeParticipantCount','joinSelectedRoom'])expect(map).toContain(token)});
 it('supports city directory filtering',()=>{const page=src('features/rooms/RoomDirectoryScreen.tsx');expect(page).toContain('setType');expect(page).toContain('query.toLowerCase()')});
 it('validates create form and bounded caps',()=>{const page=src('features/rooms/CreateRoomScreen.tsx');expect(page).toContain("type==='VOICE'?4:3");expect(page).toContain('title.trim().length<3')});
 it('auto joins before subscribing so membership auth cannot race',()=>{const page=src('features/rooms/RoomScreen.tsx');expect(page.indexOf('communityRoomsService.join(roomId)')).toBeLessThan(page.indexOf('socketService.subscribeRoom(roomId)'))});
 it('implements swipe reply and parent reference',()=>{const page=src('features/rooms/RoomScreen.tsx');expect(page).toContain('clientX-touch.current.x>55');expect(page).toContain('replyToMessageId')});
 it('implements double tap reaction and per-user toggle',()=>{const page=src('features/rooms/RoomScreen.tsx');expect(page).toContain('<360');expect(page).toContain("userId===me?.id")});
 it('persists messages via REST reload',()=>expect(src('features/rooms/RoomScreen.tsx')).toContain('communityRoomsService.messages(roomId)'));
 it('reconciles realtime message events from the authoritative REST representation',()=>{const page=src('features/rooms/RoomScreen.tsx');expect(page).toContain("socketService.on('room:message'");expect(page).toContain('void refreshMessages()');expect(page).not.toContain("setMessages(v=>v.some(x=>x.id===m.id)?v:[...v,m])")});
 it('uses no one-to-one receipt semantics',()=>expect(src('features/rooms/RoomScreen.tsx')).not.toMatch(/deliveredAt|readAt|blue.?tick/i));
 it('creates one mesh peer connection per remote peer',()=>expect(src('services/call/roomWebrtcService.ts')).toContain("new Map<string,RTCPeerConnection>()"));
 it('stops all media tracks during cleanup',()=>expect(src('services/call/roomWebrtcService.ts')).toContain("this.local?.getTracks().forEach(t=>t.stop())"));
 it('supports camera and mic toggles',()=>{const call=src('services/call/roomWebrtcService.ts');expect(call).toContain('setMuted');expect(call).toContain('setCamera')});
 it('provides complete non-empty translations for every supported locale',()=>{const keys=['people','rooms','createRoom','joinRoom','roomFull','writeMessage','permissionDenied','createHint','noRooms']as const;for(const locale of SUPPORTED_APP_LOCALES)for(const key of keys)expect(roomsText(locale,key).trim().length).toBeGreaterThan(0)});
 it('keeps Confessions and Discover routing intact',()=>{const routes=src('routes/index.tsx');expect(routes).toContain("path: 'confessions'");expect(routes).toContain("path: 'discover'")});
});
