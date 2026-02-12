import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const seats = useStore((s) => s.seats);
  const releaseSeat = useStore((s) => s.releaseSeat);
  const setIsAuthenticated = useStore((s) => s.setIsAuthenticated);

  const [query, setQuery] = useState("");

  const totalCapacity = seats.length;

  const occupiedCount = useMemo(
    () => seats.filter((s) => s.status === "booked").length,
    [seats]
  );
  const pendingCount = useMemo(
    () => seats.filter((s) => s.status === "pending").length,
    [seats]
  );

  // Match your public price (change here if your home page price changes)
  const ticketPriceNgn = 2000;
  const totalRevenue = occupiedCount * ticketPriceNgn;

  const occupancyPercent = totalCapacity
    ? Math.round((occupiedCount / totalCapacity) * 100)
    : 0;

  const handleRelease = (seatId: string) => {
    const seat = seats.find((s) => s.id === seatId);
    if (!seat) return;

    // allow releasing booked OR pending
    if (seat.status === "booked" || seat.status === "pending") {
      releaseSeat(seatId);
    }
  };

  const handleExportCSV = () => {
    // Exports seat + status + bookedBy (if any)
    const rows = [
      ["seat_id", "status", "bookedBy"].join(","),
      ...seats.map((s) => [s.id, s.status, s.bookedBy ?? ""].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "seats-export.csv";
    a.click();

    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    navigate("/admin-login");
  };

  const bookingRows = useMemo(() => {
    const active = seats.filter((s) => s.status !== "available");

    const q = query.trim().toLowerCase();
    if (!q) return active;

    return active.filter((s) => {
      return (
        s.id.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        (s.bookedBy ?? "").toLowerCase().includes(q)
      );
    });
  }, [seats, query]);

  const seatClass = (status: "available" | "pending" | "booked") => {
    if (status === "booked")
      return "bg-primary text-white cursor-pointer hover:ring-2 ring-primary/50 transition-all";
    if (status === "pending")
      return "bg-amber-400 text-white cursor-pointer hover:ring-2 ring-amber-400/50 transition-all";
    return "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 cursor-pointer hover:border-primary transition-all";
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Top Navigation Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-primary/10 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg">
            <span className="material-icons text-white">event_seat</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SeatAdmin</h1>
            <p className="text-xs text-slate-500 font-medium">
              Event Seat Management System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors px-4 py-2 rounded-lg font-medium text-sm"
            type="button"
          >
            <span className="material-icons text-sm">download</span>
            Export CSV
          </button>

          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700 mx-2"></div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition-colors px-3 py-2 rounded-lg font-medium text-sm"
            type="button"
          >
            <span className="material-icons text-sm">logout</span>
            Logout
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        {/* Dashboard Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-primary/5 shadow-sm">
            <p className="text-slate-500 text-sm font-medium">Total Capacity</p>
            <div className="flex items-end justify-between mt-1">
              <h3 className="text-2xl font-bold">{totalCapacity}</h3>
              <span className="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400">
                10x10 Grid
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-primary/5 shadow-sm">
            <p className="text-slate-500 text-sm font-medium">Occupied Seats</p>
            <div className="flex items-end justify-between mt-1">
              <h3 className="text-2xl font-bold text-primary">{occupiedCount}</h3>
              <span className="text-xs font-semibold px-2 py-1 bg-primary/10 rounded text-primary">
                {occupancyPercent}% Full
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-primary/5 shadow-sm">
            <p className="text-slate-500 text-sm font-medium">Pending Payments</p>
            <div className="flex items-end justify-between mt-1">
              <h3 className="text-2xl font-bold text-amber-500">{pendingCount}</h3>
              <span className="text-xs font-semibold px-2 py-1 bg-amber-100 dark:bg-amber-900/30 rounded text-amber-600">
                Action Required
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-primary/5 shadow-sm">
            <p className="text-slate-500 text-sm font-medium">Total Revenue</p>
            <div className="flex items-end justify-between mt-1">
              <h3 className="text-2xl font-bold text-emerald-500">
                ₦{totalRevenue.toLocaleString()}
              </h3>
              <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 rounded text-emerald-600">
                +₦0 today
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Seat Map */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-primary/5 shadow-sm p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <span className="material-icons text-primary">grid_view</span>
                  Seat Map Overview
                </h2>

                <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800 border border-slate-200"></span>
                    Avail.
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-primary"></span>
                    Booked
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-amber-400"></span>
                    Pending
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-full h-8 bg-slate-100 dark:bg-slate-800 rounded mb-10 flex items-center justify-center text-xs font-bold text-slate-400 tracking-[0.5em] uppercase border-b-4 border-primary/30">
                  STAGE AREA
                </div>

                <div className="grid grid-cols-10 gap-2 mx-auto">
                  {seats.map((seat) => (
                    <button
                      key={seat.id}
                      type="button"
                      title={
                        seat.status === "booked"
                          ? `Seat ${seat.id} • BOOKED by ${seat.bookedBy ?? "Unknown"}`
                          : `Seat ${seat.id} • ${seat.status.toUpperCase()}`
                      }
                      onClick={() => handleRelease(seat.id)}
                      className={`w-8 h-8 rounded text-[10px] flex items-center justify-center font-bold ${seatClass(
                        seat.status
                      )}`}
                    >
                      {seat.id}
                    </button>
                  ))}
                </div>

                <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                  Tip: Click a <b>Booked</b> or <b>Pending</b> seat to release it.
                </p>
              </div>
            </div>

            <div className="bg-primary/5 rounded-xl p-5 border border-primary/10">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="material-icons text-primary text-lg">info</span>
                Map Intelligence
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Your store currently tracks <b>seat status</b> and <b>bookedBy</b>.
                When backend is added, this will also show email, payment ref, and timestamps.
              </p>
            </div>
          </div>

          {/* Right Column: Bookings Table */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-primary/5 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <span className="material-icons text-primary">list_alt</span>
                  Detailed Bookings
                </h2>

                <div className="relative max-w-xs w-full">
                  <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                    search
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 ring-primary/50"
                    placeholder="Search by seat, status, or name..."
                    type="text"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Seat</th>
                      <th className="px-6 py-4">Payment Ref</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bookingRows.map((seat) => (
                      <tr
                        key={seat.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                              <span className="material-icons text-slate-500 text-sm">
                                person
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold">
                                {seat.bookedBy ?? (seat.status === "pending" ? "Pending user" : "Unknown")}
                              </p>
                              <p className="text-[10px] text-slate-500">email (backend)</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-primary/10 text-primary text-[11px] font-bold rounded">
                            {seat.id}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-xs font-mono text-slate-500">
                          {seat.status === "pending" ? (
                            <span className="text-amber-500 italic">
                              Pending verification...
                            </span>
                          ) : (
                            "REF (backend)"
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {seat.status === "booked" ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              CONFIRMED
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              PENDING
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRelease(seat.id)}
                            className="text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase"
                          >
                            Release Seat
                          </button>
                        </td>
                      </tr>
                    ))}

                    {bookingRows.length === 0 && (
                      <tr>
                        <td className="px-6 py-10 text-sm text-slate-500" colSpan={5}>
                          No active bookings found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 mt-auto flex items-center justify-between text-xs text-slate-500">
                <p>
                  Showing {bookingRows.length} of {occupiedCount + pendingCount} active bookings
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30"
                    disabled
                    type="button"
                  >
                    <span className="material-icons text-sm leading-none">chevron_left</span>
                  </button>
                  <span className="font-bold text-slate-700 dark:text-slate-300">1</span>
                  <button
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30"
                    disabled
                    type="button"
                  >
                    <span className="material-icons text-sm leading-none">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Help Button */}
      <button
        type="button"
        onClick={() =>
          alert(
            "Admin tip: click any booked/pending seat to release it. Backend will later show email + payment reference."
          )
        }
        className="fixed bottom-6 right-6 w-12 h-12 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-40"
      >
        <span className="material-icons">help_outline</span>
      </button>
    </div>
  );
}
