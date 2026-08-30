import { apiClient } from '../api/apiClient';

export type RoomType = 'TEXT'|'VOICE'|'VIDEO';
export interface RoomParticipant { id:string; name:string; photoUrl?:string|null; role:'OWNER'|'MODERATOR'|'MEMBER'; verified?:boolean }
export interface CommunityRoom { id:string; slug?:string|null; title:string; topic:string; type:RoomType; language:string; cityId:number; city:string; countryId:string; country:string; latitude:number; longitude:number; ownerId?:string|null; ownerName?:string|null; status:'ACTIVE'|'CLOSED'|'SUSPENDED'; maxParticipants:number; activeParticipantCount:number; messageCount:number; reportCount?:number; isOfficial:boolean; isDemo:boolean; participants:RoomParticipant[]; membership?:{role:string;status:string}|null; createdAt:string; updatedAt:string }
export interface RoomMessage { id:string; roomId:string; senderId?:string|null; clientMessageId?:string|null; text:string; isDeleted:boolean; isSystem:boolean; replyToMessageId?:string|null; replyPreview?:{id:string;senderId?:string|null;senderName:string;text:string;unavailable?:boolean}|null; sender:{id?:string|null;name:string;photoUrl?:string|null;verified?:boolean}; reactions:{userId:string;reaction:string}[]; createdAt:string }

const data = <T>(response:any):T => response?.data as T;
export const communityRoomsService = {
  list: async (params:Record<string,string|number|undefined>={}) => {
    const query=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')query.set(k,String(v));});
    return data<CommunityRoom[]>(await apiClient.get(`/api/rooms${query.size?`?${query}`:''}`));
  },
  city: async (cityId:number) => data<{city:{id:number;name:string;countryId:string;country:string;latitude:number;longitude:number};rooms:CommunityRoom[]}>(await apiClient.get(`/api/rooms/cities/${cityId}`)),
  get: async (id:string) => data<CommunityRoom>(await apiClient.get(`/api/rooms/${id}`)),
  create: async (body:{title:string;topic:string;type:RoomType;language:string;cityId:number;maxParticipants:number}) => data<CommunityRoom>(await apiClient.post('/api/rooms',body)),
  join: async (id:string) => data<CommunityRoom>(await apiClient.post(`/api/rooms/${id}/join`)),
  leave: async (id:string) => apiClient.post(`/api/rooms/${id}/leave`),
  messages: async (id:string,before?:string) => data<RoomMessage[]>(await apiClient.get(`/api/rooms/${id}/messages${before?`?before=${encodeURIComponent(before)}`:''}`)),
  members: async (id:string) => data<RoomParticipant[]>(await apiClient.get(`/api/rooms/${id}/members`)),
  report: async (id:string,body:{targetType:'ROOM'|'MESSAGE'|'USER';reason:string;messageId?:string;reportedUserId?:string;details?:string}) => apiClient.post(`/api/rooms/${id}/report`,body),
};
