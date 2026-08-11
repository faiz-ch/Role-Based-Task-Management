import React from "react";
import { Activity } from "lucide-react";

interface ActivityTabProps {
  activity: any[];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDateOnly(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActivityIcon(action: string) {
  const actionLower = action.toLowerCase();
  
  if (actionLower.includes("create") || actionLower.includes("created")) {
    return "bg-green-500";
  }
  if (actionLower.includes("update") || actionLower.includes("updated") || actionLower.includes("edit")) {
    return "bg-blue-500";
  }
  if (actionLower.includes("delete") || actionLower.includes("deleted")) {
    return "bg-red-500";
  }
  if (actionLower.includes("complete") || actionLower.includes("completed") || actionLower.includes("done")) {
    return "bg-emerald-500";
  }
  if (actionLower.includes("approve") || actionLower.includes("approved")) {
    return "bg-emerald-500";
  }
  if (actionLower.includes("reject") || actionLower.includes("rejected")) {
    return "bg-red-500";
  }
  
  return "bg-gray-500";
}

export function ActivityTab({ activity }: ActivityTabProps) {
  if (activity.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-foreground">Activity Log</h2>
        </div>
        <div className="text-sm text-muted-foreground text-center py-8">
          No activity recorded yet
        </div>
      </div>
    );
  }

  // Group activity by date
  const groupedActivity = activity.reduce((groups, act) => {
    const date = fmtDateOnly(act.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(act);
    return groups;
  }, {} as Record<string, any[]>);

  const sortedDates = Object.keys(groupedActivity).sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={18} className="text-blue-500" />
        <h2 className="text-sm font-semibold text-foreground">Activity Log</h2>
      </div>

      <div className="space-y-6">
        {sortedDates.map((date) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px bg-border flex-1" />
              <span className="text-xs font-medium text-muted-foreground">{date}</span>
              <div className="h-px bg-border flex-1" />
            </div>
            
            <div className="space-y-3 ml-4">
              {groupedActivity[date].map((act) => (
                <div key={act.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full ${getActivityIcon(act.action || act.description)} mt-2 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{act.description || act.action}</p>
                    {act.user_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        by {act.user_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {fmtDate(act.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}