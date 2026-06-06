export type Message =
  | { type: "found"; result: unknown }
  | { type: "progress"; attempts: number }
  | { type: "done" }
  | { type: "error"; message: string };

export type Pool = {
  spawn: (
    index: number,
    onMessage: (message: Message) => void,
    onError: (error: unknown) => void
  ) => {
    postMessage: (message: unknown) => void;
    terminate: () => void;
  };
};

export async function resolve(): Promise<Pool | null> {
  return null;
}
