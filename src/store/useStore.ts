import { create } from "zustand";

export type SeatStatus = "available" | "pending" | "booked";

export interface Seat {
  id: string;
  status: SeatStatus;
  bookedBy?: string;
}

interface StoreState {
  // User
  name: string;
  email: string;
  profilePicture: File | null;
  selectedSeat: string | null;
  paymentReference: string | null;

  // Admin
  isAuthenticated: boolean;

  // Seats
  seats: Seat[];

  // Actions
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setProfilePicture: (file: File | null) => void;
  setIsAuthenticated: (auth: boolean) => void;

  selectSeat: (seatId: string) => void;
  confirmBooking: () => void;
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

export const useStore = create<StoreState>((set, get) => ({
  // User
  name: "",
  email: "",
  profilePicture: null,
  selectedSeat: null,
  paymentReference: null,

  // Admin
  isAuthenticated: false,

  // Seats
  seats: generateSeats(),

  // Actions
  setName: (name) => set({ name }),
  setEmail: (email) => set({ email }),
  setProfilePicture: (file) => set({ profilePicture: file }),
  setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),

  selectSeat: (seatId) => {
    const updated = get().seats.map((seat) => {
      if (seat.id === seatId && seat.status === "available") {
        return { ...seat, status: "pending" as const };
      }
      if (seat.status === "pending") {
        return { ...seat, status: "available" as const };
      }
      return seat;
    });

    set({ seats: updated, selectedSeat: seatId });
  },

  confirmBooking: () => {
    const { selectedSeat, name } = get();
    if (!selectedSeat) return;

    const updated = get().seats.map((seat) =>
      seat.id === selectedSeat
        ? { ...seat, status: "booked" as const, bookedBy: name }
        : seat
    );

    set({
      seats: updated,
      paymentReference: `REF-${Date.now()}`,
    });
  },

  releaseSeat: (seatId) => {
    const updated = get().seats.map((seat) =>
      seat.id === seatId ? { ...seat, status: "available" as const, bookedBy: undefined } : seat
    );

    set({ seats: updated });
  },
}));
