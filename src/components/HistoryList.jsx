import { formatDateTime } from "../utils/format";

export default function HistoryList({ title, items, emptyTitle, emptyText, renderItem, onRefresh }) {
  return (
    <div className="card glass">
      <div className="card-header">
        <h2>{title}</h2>
        {onRefresh ? (
          <button className="btn btn-ghost" onClick={onRefresh}>
            Refresh
          </button>
        ) : null}
      </div>

      {!items || items.length === 0 ? (
        <div className="empty-state">
          <p>{emptyTitle}</p>
          <span>{emptyText}</span>
        </div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.id}>
              <div className="list-main">{renderItem(item)}</div>
              <span className="timestamp">
                {formatDateTime(item.created_at || item.performed_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}