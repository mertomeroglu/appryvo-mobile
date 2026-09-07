import { apiClient } from '../api/apiClient';

export type RoomType = 'TEXT'|'VOICE'|'VIDEO';
export type RoomCategory = 'GENERAL'|'TRAVEL'|'FOOD_CAFE'|'MUSIC'|'MOVIES'|'GAMING'|'TECHNOLOGY'|'LOCAL'|'LANGUAGE'|'OTHER';
export type RoomMessageType = 'TEXT'|'AUDIO'|'STICKER';
export interface Sticker { id:string; emoji:string; labelTr:string; labelEn:string }
export interface RoomParticipant { id:string; name:string; photoUrl?:string|null; role:'OWNER'|'MODERATOR'|'MEMBER'; verified?:boolean }
export interface CommunityRoom { id:string; slug?:string|null; title:string; topic:string; type:RoomType; category:RoomCategory; language:string; cityId:number; city:string; countryId:string; country:string; latitude:number; longitude:number; regionLabel?:string|null; coverUrl?:string|null; ownerId?:string|null; ownerName?:string|null; status:'ACTIVE'|'CLOSED'|'SUSPENDED'; maxParticipants:number; activeParticipantCount:number; messageCount:number; reportCount?:number; isOfficial:boolean; isDemo:boolean; participants:RoomParticipant[]; membership?:{role:string;status:string}|null; createdAt:string; updatedAt:string }
export interface RoomMessage { id:string; roomId:string; senderId?:string|null; clientMessageId?:string|null; text:string; isDeleted:boolean; isSystem:boolean; replyToMessageId?:string|null; replyPreview?:{id:string;senderId?:string|null;senderName:string;text:string;unavailable?:boolean}|null; messageType:RoomMessageType; mediaUrl?:string|null; durationSeconds?:number|null; stickerId?:string|null; isHighlighted:boolean; sender:{id?:string|null;name:string;photoUrl?:string|null;verified?:boolean}; reactions:{userId:string;reaction:string}[]; createdAt:string }

const data = <T>(response:any):T => response?.data as T;
export const communityRoomsService = {
  list: async (params:Record<string,string|number|undefined>={}) => {
    const query=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')query.set(k,String(v));});
    return data<CommunityRoom[]>(await apiClient.get(`/api/rooms${query.size?`?${query}`:''}`));
  },
  city: async (cityId:number) => data<{city:{id:number;name:string;countryId:string;country:string;latitude:number;longitude:number};rooms:CommunityRoom[]}>(await apiClient.get(`/api/rooms/cities/${cityId}`)),
  get: async (id:string) => data<CommunityRoom>(await apiClient.get(`/api/rooms/${id}`)),
  // V3: rooms are always TEXT -- `type` is no longer sent, the server hardcodes it server-side.
  create: async (body:{title:string;topic:string;category:RoomCategory;language:string;cityId:number;maxParticipants:number;idempotencyKey:string;coverUrl?:string|null}) => data<CommunityRoom>(await apiClient.post('/api/rooms',body)),
  // Owner-only; the server re-checks ownership in the UPDATE itself. Pass null to clear.
  setCover: async (id:string, coverUrl:string|null) => data<CommunityRoom>(await apiClient.patch(`/api/rooms/${id}/cover`,{coverUrl})),
  join: async (id:string) => data<CommunityRoom>(await apiClient.post(`/api/rooms/${id}/join`)),
  leave: async (id:string) => apiClient.post(`/api/rooms/${id}/leave`),
  messages: async (id:string,before?:string) => data<RoomMessage[]>(await apiClient.get(`/api/rooms/${id}/messages${before?`?before=${encodeURIComponent(before)}`:''}`)),
  members: async (id:string) => data<RoomParticipant[]>(await apiClient.get(`/api/rooms/${id}/members`)),
  report: async (id:string,body:{targetType:'ROOM'|'MESSAGE'|'USER';reason:string;messageId?:string;reportedUserId?:string;details?:string}) => apiClient.post(`/api/rooms/${id}/report`,body),
  stickers: async () => data<Sticker[]>(await apiClient.get('/api/rooms/stickers')),
  config: async () => data<{creationCostCoins:number;dailyCreateLimit:number}>(await apiClient.get('/api/rooms/config')),
  // 10-coin atomic debit + highlighted message send -- see connect_pass_controller.js's sibling
  // POST /:roomId/messages/highlighted for the exact server-side transaction.
  sendHighlighted: async (id:string, text:string, idempotencyKey:string) =>
    data<{message:RoomMessage;balance:number;replayed:boolean}>(await apiClient.post(`/api/rooms/${id}/messages/highlighted`,{text,idempotencyKey})),
};
