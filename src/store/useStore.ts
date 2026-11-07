import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Draft = { name: string; email: string; seat: string };
type State = Draft & { requestId: string; update: (fields: Partial<Draft>) => void; getRequestId: () => string };

export const useStore = create<State>()(persist((set, get) => ({
  name: "", email: "", seat: "", requestId: "",
  update: (fields) => set({ ...fields, requestId: "" }),
  getRequestId: () => {
    const requestId = get().requestId || crypto.randomUUID();
    set({ requestId });
    return requestId;
  },
}), {
  name: "series-004-draft",
  storage: createJSONStorage(() => sessionStorage),
  partialize: ({ name, email, seat, requestId }) => ({ name, email, seat, requestId }),
}));
