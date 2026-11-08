import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

export default function BookAnotherSeat({ ticketId, disabled = false }: { ticketId: string; disabled?: boolean }) {
  const navigate = useNavigate();
  return <button className="outline" type="button" disabled={disabled} onClick={() => {
    useStore.getState().startAnother(ticketId);
    navigate("/#booking");
  }}>Book another seat</button>;
}
