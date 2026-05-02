import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import {
  type UserStatus,
  loadActiveStatuses,
  loadMyViews,
  subscribeToStatusChanges,
} from "@/lib/statusService";
import { StatusViewer } from "./StatusViewer";
import { AddStatus } from "./AddStatus";

interface Props {
  currentUserId: string;
}

export function StatusList({ currentUserId }: Props) {
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [myStatus, setMyStatus] = useState<UserStatus | null>(null);
  const [viewedStatuses, setViewedStatuses] = useState<Set<string>>(new Set());
  const [selectedStatus, setSelectedStatus] = useState<UserStatus | null>(null);
  const [showAddStatus, setShowAddStatus] = useState(false);

  // تحميل الحالات عند البدء
  useEffect(() => {
    loadData();

    // تنظيف الحالات المنتهية كل دقيقة
    const interval = setInterval(loadData, 60000);

    return () => clearInterval(interval);
  }, [currentUserId]);

  // اشتراك في التغييرات
  useEffect(() => {
    const unsubscribe = subscribeToStatusChanges(
      () => loadData(),
      () => loadData()
    );
    return unsubscribe;
  }, [currentUserId]);

  async function loadData() {
    const all = await loadActiveStatuses();
    const others = all.filter(s => s.user_id !== currentUserId);
    const mine = all.find(s => s.user_id === currentUserId);
    setStatuses(others);
    setMyStatus(mine || null);

    // تحميل الحالات المشاهدة
    const viewed = await loadMyViews(currentUserId);
    setViewedStatuses(new Set(viewed));
  }

  function handleStatusClick(status: UserStatus) {
    setSelectedStatus(status);
  }

  function handleCloseViewer() {
    setSelectedStatus(null);
  }

  function handleNextStatus() {
    if (!selectedStatus) return;
    const currentIndex = statuses.findIndex(s => s.id === selectedStatus.id);
    if (currentIndex < statuses.length - 1) {
      setSelectedStatus(statuses[currentIndex + 1]);
    } else {
      setSelectedStatus(null);
    }
  }

  return (
    <>
      <div className="status-list-container">
        <div className="status-scroll">
          {/* حالتي */}
          <div
            className="status-item"
            onClick={() => {
              if (myStatus) {
                handleStatusClick(myStatus);
              } else {
                setShowAddStatus(true);
              }
            }}
          >
            <div className={`status-circle ${myStatus ? "has-status" : "add-status"}`}>
              {myStatus ? (
                myStatus.type === "text" ? (
                  <div
                    className="status-thumb"
                    style={{ backgroundColor: myStatus.background_color }}
                  >
                    <FileText className="w-5 h-5 text-white/80" />
                  </div>
                ) : (
                  <img src={myStatus.media_url || "/avatar.png"} alt="حالتي" />
                )
              ) : (
                <div className="status-add-icon"><Plus className="w-7 h-7" /></div>
              )}
            </div>
            <span className="status-label">حالتي</span>
          </div>

          {/* حالات الآخرين */}
          {statuses.map((status) => (
            <div
              key={status.id}
              className="status-item"
              onClick={() => handleStatusClick(status)}
            >
              <div
                className={`status-circle ${
                  !viewedStatuses.has(status.id) ? "unviewed" : ""
                }`}
              >
                {status.user_avatar ? (
                  <img src={status.user_avatar} alt={status.user_name} />
                ) : (
                  <div className="status-avatar-placeholder">
                    {status.user_name?.charAt(0) || "?"}
                  </div>
                )}
              </div>
              <span className="status-label">
                {status.user_name?.length > 10
                  ? status.user_name.substring(0, 10) + "..."
                  : status.user_name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* عارض الحالة */}
      {selectedStatus && (
        <StatusViewer
          status={selectedStatus}
          currentUserId={currentUserId}
          onClose={handleCloseViewer}
          onNext={handleNextStatus}
        />
      )}

      {/* نافذة إضافة حالة */}
      {showAddStatus && (
        <AddStatus
          currentUserId={currentUserId}
          currentUserName="أنت"
          onClose={() => setShowAddStatus(false)}
          onSuccess={() => {
            setShowAddStatus(false);
            loadData();
          }}
        />
      )}

      <style>{`
        .status-list-container {
          background: white;
          padding: 12px 0;
          border-bottom: 1px solid #e0e0e0;
        }

        .status-scroll {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding: 0 16px;
          scrollbar-width: none;
        }
        .status-scroll::-webkit-scrollbar {
          display: none;
        }

        .status-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          min-width: 65px;
        }

        .status-circle {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          padding: 2px;
          border: 2px solid #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .status-circle.unviewed {
          border: 2px solid transparent;
          background: linear-gradient(45deg, #25D366, #128C7E, #075E54);
        }
        .status-circle.unviewed img,
        .status-circle.unviewed .status-avatar-placeholder {
          border: 2px solid white;
        }

        .status-circle.has-status {
          border-color: #ccc;
        }

        .status-circle.add-status {
          border-style: dashed;
          border-color: #25D366;
        }

        .status-circle img,
        .status-thumb,
        .status-avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .status-thumb {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .status-avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #128C7E;
          color: white;
          font-weight: bold;
          font-size: 22px;
        }

        .status-add-icon {
          font-size: 32px;
          color: #25D366;
          font-weight: bold;
        }

        .status-label {
          font-size: 11px;
          color: #555;
          text-align: center;
          max-width: 65px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}