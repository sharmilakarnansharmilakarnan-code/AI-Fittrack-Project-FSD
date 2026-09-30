import { useCallback, useEffect, useState } from "react";
import { attendanceApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { errorText, formatDateTime } from "../utils/format";

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await attendanceApi.list({ limit: 50 });
      setRecords(res.data.data.attendance);
      setCurrent(res.data.data.currentVisit);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The backend decides whether check-in / check-out is allowed (one open visit at a time).
  const run = async (action, message) => {
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Gym attendance</h1>
          <p className="page-header__subtitle">Check in when you arrive and check out when you leave.</p>
        </div>
        {current ? (
          <button className="btn btn--primary" onClick={() => run(() => attendanceApi.checkOut(), "Checked out. See you next time!")}>Check out</button>
        ) : (
          <button className="btn btn--primary" onClick={() => run(() => attendanceApi.checkIn(), "Checked in. Have a great workout!")}>Check in</button>
        )}
      </div>

      <Banner type="error" onClose={() => setError("")}>{error}</Banner>
      <Banner type="success" onClose={() => setSuccess("")}>{success}</Banner>
      {current && <Banner type="info">You are checked in since {formatDateTime(current.checkInTime)}.</Banner>}

      {isLoading ? (
        <Loader label="Loading attendance…" />
      ) : records.length === 0 ? (
        <EmptyState title="No visits yet" description="Use the Check in button to record your first gym visit." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Check-in</th><th>Check-out</th><th>Duration</th></tr></thead>
            <tbody>
              {records.map((a) => (
                <tr key={a._id}>
                  <td>{formatDateTime(a.checkInTime)}</td>
                  <td>{a.checkOutTime ? formatDateTime(a.checkOutTime) : a.isOpen ? "in progress" : "-"}</td>
                  <td className="numeral">{a.durationMinutes !== undefined ? `${a.durationMinutes} min` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
