import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

export default function SeatBooking() {
  const navigate = useNavigate();

  const name = useStore((s) => s.name);
  const email = useStore((s) => s.email);
  const profilePicture = useStore((s) => s.profilePicture);
  const selectedSeat = useStore((s) => s.selectedSeat);
  const seats = useStore((s) => s.seats);

  const setName = useStore((s) => s.setName);
  const setEmail = useStore((s) => s.setEmail);
  const setProfilePicture = useStore((s) => s.setProfilePicture);
  const selectSeat = useStore((s) => s.selectSeat);

  const previewUrl = useMemo(() => {
    if (!profilePicture) return null;
    return URL.createObjectURL(profilePicture);
  }, [profilePicture]);

  const handleProceed = () => {
    if (!name || !email || !profilePicture || !selectedSeat) {
      alert("Please fill in your name, email, upload a picture, and select a seat.");
      return;
    }
    navigate("/payment");
  };

  return (
    <>
      {/* Header (Stitch) */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white">
                <span className="material-icons text-xl">event_seat</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight">
                MY HIGHS &<span className="text-primary"> I</span>
              </h1>
            </div>

            <Link
              to="/admin-login"
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <span className="material-icons text-sm">admin_panel_settings</span>
              Admin Login
            </Link>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <span className="material-icons text-primary">person</span>
                Attendee Information
              </h2>

              <form className="space-y-6">
                {/* Profile Upload */}
                <div className="flex flex-col items-center justify-center space-y-4 py-4">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-700 shadow-md">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onLoad={() => URL.revokeObjectURL(previewUrl)}
                        />
                      ) : (
                        <span className="material-icons text-4xl text-slate-400 flex items-center justify-center w-full h-full">
                          person
                        </span>
                      )}
                    </div>

                    <label className="absolute bottom-1 right-1 bg-primary text-white p-2 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-lg">
                      <span className="material-icons text-sm">photo_camera</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => setProfilePicture(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>

                  <div className="text-center">
                    <p className="text-sm font-medium">Upload Photo</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      JPG or PNG. Max 2MB.
                    </p>
                  </div>
                </div>

                {/* Full Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </form>
            </div>

            {/* Info Box */}
            <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex gap-3">
              <span className="material-icons text-primary">info</span>
              <div>
                <h3 className="text-sm font-semibold text-primary">E-Card Registration</h3>
                <p className="text-xs text-primary/80 mt-1 leading-relaxed">
                  Your profile picture and name will be used to generate your digital entry
                  card once payment is confirmed.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span className="material-icons text-primary">grid_view</span>
                    Select Your Seat
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Click on an available seat to select it.
                  </p>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 p-3 bg-background-light dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-status-available"></div>
                    <span className="text-xs font-medium">Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-status-pending"></div>
                    <span className="text-xs font-medium">Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-status-taken"></div>
                    <span className="text-xs font-medium">Taken</span>
                  </div>
                </div>
              </div>

              {/* Stage */}
              <div className="w-full mb-12">
                <div className="h-1.5 w-3/4 mx-auto bg-slate-200 dark:bg-slate-700 rounded-full mb-2"></div>
                <p className="text-[10px] text-center uppercase tracking-widest text-slate-400 font-bold">
                  Stage / Screen Area
                </p>
              </div>

              {/* Seat Grid */}
              <div className="seat-grid grid grid-cols-10 gap-2 max-w-[500px] mx-auto mb-10">
                {seats.map((seat) => (
                  <div
                    key={seat.id}
                    onClick={() => seat.status !== "booked" && selectSeat(seat.id)}
                    title={seat.status === "booked" ? "Taken" : undefined}
                    className={`w-10 h-10 rounded flex items-center justify-center text-[10px] ${
                      seat.status === "available"
                        ? "bg-status-available text-slate-600 dark:text-slate-300 cursor-pointer hover:ring-2 ring-primary ring-offset-2 transition-all"
                        : seat.status === "pending"
                        ? "bg-status-pending text-white cursor-pointer"
                        : "bg-status-taken text-white cursor-not-allowed"
                    }`}
                  >
                    {seat.id}
                  </div>
                ))}
              </div>

              {/* Summary & Proceed */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <span className="material-icons text-primary">local_activity</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                      Selected Seat
                    </p>
                    <p className="text-xl font-bold">{selectedSeat ?? "-"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Ticket Price
                    </p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">
                      ₦2000.00
                    </p>
                  </div>
                  <button
                    className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-lg font-semibold shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                    onClick={handleProceed}
                  >
                    Proceed to Payment
                    <span className="material-icons text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* End Right Column */}
        </div>
      </main>
    </>
  );
}
