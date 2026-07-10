import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SeatStatus = "available" | "pending" | "booked";

export interface Seat {
  id: string;
  status: SeatStatus;
  bookedBy?: string;
}

interface StoreState {
  name: string;
  email: string;
  profilePicture: string | null; // Changed to string (Base64)
  selectedSeat: string | null;
  paymentReference: string | null;
  isAuthenticated: boolean;
  seats: Seat[];

  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setProfilePicture: (base64: string | null) => void;
  setIsAuthenticated: (auth: boolean) => void;
  selectSeat: (seatId: string) => void;
  confirmBooking: (ref: string) => void;
  releaseSeat: (seatId: string) => void;
}

const generateSeats = (): Seat[] => {
  const rows = "ABCDEFGHIJ";
  const out: Seat[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let i = 1; i <= 10; i++) {
      out.push({ id: `${rows[r]}${i}`, status: "available" });
    }
  }
  return out;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      name: "",
      email: "",
      profilePicture: null,
      selectedSeat: null,
      paymentReference: null,
      isAuthenticated: false,
      seats: generateSeats(),

      setName: (name) => set({ name }),
      setEmail: (email) => set({ email }),
      setProfilePicture: (base64) => set({ profilePicture: base64 }),
      setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),

      selectSeat: (seatId) => {
        const updated = get().seats.map((seat) => {
          if (seat.id === seatId && seat.status === "available") {
            return { ...seat, status: "pending" as const };
          }
          if (seat.status === "pending" && seat.id !== seatId) {
             return { ...seat, status: "available" as const };
          }
          return seat;
        });
        set({ seats: updated, selectedSeat: seatId });
      },

      confirmBooking: (ref) => {
        const { selectedSeat, name } = get();
        if (!selectedSeat) return;
        const updated = get().seats.map((seat) =>
          seat.id === selectedSeat
            ? { ...seat, status: "booked" as const, bookedBy: name }
            : seat
        );
        set({ seats: updated, paymentReference: ref });
      },

      releaseSeat: (seatId) => {
        const updated = get().seats.map((seat) =>
          seat.id === seatId ? { ...seat, status: "available" as const, bookedBy: undefined } : seat
        );
        set({ seats: updated });
      },
    }),
    {
      name: "booking-storage",
      storage: createJSONStorage(() => localStorage),
      // ONLY persist these fields to avoid errors with complex objects
      partialize: (state) => ({
        name: state.name,
        email: state.email,
        profilePicture: state.profilePicture,
        selectedSeat: state.selectedSeat,
        paymentReference: state.paymentReference,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);