import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

export default function Payment() {
  const navigate = useNavigate();

  const name = useStore((s) => s.name);
  const email = useStore((s) => s.email);
  const profilePicture = useStore((s) => s.profilePicture);
  const selectedSeat = useStore((s) => s.selectedSeat);
  const confirmBooking = useStore((s) => s.confirmBooking);

  // Keep these consistent with the SeatBooking page UI
  const eventName = "EventBookingPro";
  const ticketPriceNgn = 2000;

  // 5:00 countdown (UI only for now)
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const timerText = useMemo(() => {
    const mm = Math.floor(secondsLeft / 60);
    const ss = secondsLeft % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }, [secondsLeft]);

  const previewUrl = useMemo(() => {
    if (!profilePicture) return null;
    return URL.createObjectURL(profilePicture);
  }, [profilePicture]);

  // Guard: user must come from SeatBooking page
  if (!name || !email || !profilePicture || !selectedSeat) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <p className="text-red-500 font-semibold">
          Missing booking info. Go back and select a seat first.
        </p>
        <Link to="/" className="text-primary font-semibold underline">
          Back to Seat Selection
        </Link>
      </div>
    );
  }

  const handleMockPay = () => {
    // Simulate "Paystack verified" for now
    confirmBooking();
    navigate("/ticket");
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-800 dark:text-slate-200 min-h-screen flex items-center justify-center p-6">
      <div className="max-w-[480px] w-full">
        {/* Main Confirmation Card */}
        <div className="bg-white dark:bg-slate-900 shadow-xl rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
          {/* Progress Bar */}
          <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-primary w-2/3"></div>
          </div>

          <div className="p-8 text-center">
            {/* Header */}
            <h1 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">
              Confirm Your Booking
            </h1>

            {/* Profile Preview */}
            <div className="relative inline-block mb-6">
              {previewUrl ? (
                <img
                  alt="User Profile"
                  className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 shadow-md object-cover"
                  src={previewUrl}
                  onLoad={() => URL.revokeObjectURL(previewUrl)}
                />
              ) : null}

              <div className="absolute bottom-0 right-0 bg-primary text-white p-1 rounded-full border-2 border-white dark:border-slate-800 shadow-sm">
                <span className="material-icons-outlined text-sm block">check</span>
              </div>
            </div>

            {/* User Identification */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold">{name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{email}</p>
            </div>

            {/* Data Grid Summary */}
            <div className="space-y-4 mb-8 text-left">
              <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">
                  Event
                </span>
                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                  {eventName}
                </span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">
                  Seat Number
                </span>
                <span className="font-bold text-primary text-lg">
                  {selectedSeat}
                </span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">
                  Service Fee
                </span>
                <span className="text-slate-900 dark:text-white text-sm">₦0.00</span>
              </div>

              <div className="flex justify-between items-center py-4">
                <span className="text-slate-900 dark:text-white font-bold">Total Amount</span>
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  ₦{ticketPriceNgn.toLocaleString()}
                  <span className="text-base font-semibold">.00</span>
                </span>
              </div>
            </div>

            {/* Call to Action */}
            <button
              onClick={handleMockPay}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 px-6 rounded-lg shadow-md transition-all duration-200 flex items-center justify-center gap-2 mb-4 group"
            >
              <span className="material-icons-outlined">payment</span>
              Pay with Paystack
            </button>

            {/* Timer Notice */}
            <div className="bg-primary/10 dark:bg-primary/5 rounded-lg p-4 mb-6 flex items-start gap-3 text-left">
              <span className="material-icons-outlined text-primary text-xl">timer</span>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Your seat is temporarily reserved for{" "}
                <span className="font-bold text-primary">{timerText} minutes</span>{" "}
                while you complete payment. Please finish before the timer expires.
              </p>
            </div>

            {/* Secondary Link */}
            <Link
              to="/"
              className="text-sm text-slate-500 hover:text-primary transition-colors inline-flex items-center gap-1 font-medium"
            >
              <span className="material-icons-outlined text-base">arrow_back</span>
              Back to Seat Selection
            </Link>
          </div>

          {/* Footer Icons */}
          <div className="bg-slate-50 dark:bg-slate-950 px-8 py-4 flex justify-center items-center gap-6 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1 opacity-40 grayscale filter hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
              <span className="material-icons-outlined text-xl">credit_card</span>
              <span className="text-xs font-bold uppercase tracking-tighter">VISA</span>
            </div>
            <div className="flex items-center gap-1 opacity-40 grayscale filter hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
              <span className="material-icons-outlined text-xl">account_balance</span>
              <span className="text-xs font-bold uppercase tracking-tighter">SECURE</span>
            </div>
            <div className="flex items-center gap-1 opacity-40 grayscale filter hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
              <span className="material-icons-outlined text-xl">lock</span>
              <span className="text-xs font-bold uppercase tracking-tighter">ENCRYPTED</span>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <p className="text-center mt-8 text-slate-400 dark:text-slate-600 text-xs px-4">
          By clicking Pay with Paystack, you agree to the event Terms of Service and Privacy
          Policy. All transactions are securely processed.
        </p>
      </div>
    </div>
  );
}
