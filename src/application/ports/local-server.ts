export interface LocalServer {
  start(): Promise<string>;
  stop(): Promise<void>;
}
