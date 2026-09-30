import { statusTone } from "../utils/format";

export default function StatusBadge({ status }) {
  return <span className={`badge badge--${statusTone(status)}`}>{status}</span>;
}
