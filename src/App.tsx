import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import SeatBooking from "./pages/SeatBooking";
import Payment from "./pages/Payment";
import Ticket from "./pages/Ticket";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import PreviewCheckout from "./pages/PreviewCheckout";
import { isLoopback } from "./booking";

export default function App() {
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<SeatBooking />} />
      <Route path="/payment" element={<Payment />} />
      <Route path="/ticket" element={<Ticket />} />
      {isLoopback() && <Route path="/preview-checkout" element={<PreviewCheckout />} />}
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/admin-dashboard" element={<AdminDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>;
}
