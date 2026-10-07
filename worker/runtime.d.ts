// このWorkerで使うCloudflare固有APIだけを宣言する。DOM型はブラウザと共有する。
interface WorkerWebSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment<T>(): T;
}
declare const WebSocketPair: { new(): { 0: WebSocket; 1: WorkerWebSocket } };
interface ResponseInit { webSocket?: WebSocket }
interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAll(): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  getWebSockets(): WorkerWebSocket[];
  acceptWebSocket(socket: WorkerWebSocket): void;
}
interface DurableObjectNamespace {
  idFromName(name: string): string;
  get(id: string): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}
