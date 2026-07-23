export interface WatchPartyVideo {
  videoId: string;
  title: string;
  kind: string;
  thumbnail?: string;
}
export interface WatchPartyMessage {
  type: 'playback' | 'reaction' | 'sync-request';
  action?: string;
  position?: number;
  playing?: boolean;
  sentAt?: number;
  reaction?: string;
  messageId?: string;
}
export interface ThroupleWatchPartyPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  start(options: WatchPartyVideo): Promise<{ presented: boolean }>;
  leave(): Promise<void>;
  sendMessage(message: WatchPartyMessage): Promise<void>;
  getState(): Promise<{
    active: boolean;
    participants: number;
    videoId?: string;
    title?: string;
    kind?: string;
  }>;
}
export declare const ThroupleWatchParty: ThroupleWatchPartyPlugin | undefined;
