import type { UIMessage } from "ai";
import { create } from "zustand";

/**
 * Which thread this tab is editing. Separate from the resume itself because
 * the id outlives every document that passes through it, and because the
 * runtime needs it at mount while the editor needs it on every save.
 */
type ThreadState = {
  id: string;
  /** Read once when the runtime mounts. Not kept in sync afterwards. */
  initialMessages: UIMessage[];
  /** True once the thread exists in the URL, which is also when saving starts. */
  addressed: boolean;
  address: () => void;
};

export const useThreadStore = create<ThreadState>()((set) => ({
  id: "",
  initialMessages: [],
  addressed: false,
  address: () => set({ addressed: true }),
}));

/**
 * Called once, before anything reads the store. A fresh thread starts
 * unaddressed: it has an id, but the URL stays at `/` and nothing is written
 * until the first message makes it worth keeping.
 */
export function seedThread(input: { id: string; messages?: UIMessage[]; addressed: boolean }) {
  useThreadStore.setState({
    id: input.id,
    initialMessages: input.messages ?? [],
    addressed: input.addressed,
  });
}
