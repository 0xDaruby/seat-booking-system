import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Draft = { name: string; email: string; seat: string; referralCode: string };
type State = Draft & { requestId: string; afterTicket?: string; update: (fields: Partial<Draft>) => void; getRequestId: () => string; startAnother: (ticketId: string) => void };

export const useStore = create<State>()(persist((set, get) => ({
  name: "", email: "", seat: "", referralCode: "", requestId: "",
  update: (fields) => set({ ...fields, requestId: "" }),
  startAnother: (ticketId) => set({ seat: "", requestId: "", afterTicket: ticketId }),
  getRequestId: () => {
    const requestId = get().requestId || crypto.randomUUID();
    set({ requestId });
    return requestId;
  },
}), {
  name: "series-004-draft",
  storage: createJSONStorage(() => sessionStorage),
  partialize: ({ name, email, seat, referralCode, requestId, afterTicket }) => ({ name, email, seat, referralCode, requestId, afterTicket }),
}));
