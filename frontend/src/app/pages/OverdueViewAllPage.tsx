import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, ChevronRight, Clock } from "lucide-react";
import { getOverdueTasks, getOverdueSubtasks, getOverdueProjects, OverdueItem } from "../api/dashboard";
import { StatusBadge } from "../components/StatusBadge";

interface OverdueViewAllPageProps {
  type?: "tasks" | "subtasks" | "projects";
}

const TYPE_CONFIG = {
  tasks: {
    title: "Overdue Tasks",
    fetchFn: getOverdueTasks,
    getItemPath: (id: number) => `/tasks/${id}`,
    getContext: (item: OverdueItem) => item.project_name ? `Project: ${item.project_name}` : null,
  },
  subtasks: {
    title: "Overdue Subtasks",
    fetchFn: getOverdueSubtasks,
    getItemPath: (id: number) => `/subtasks/${id}`,
    getContext: (item: OverdueItem) => {
      const parts = [];
      if (item.project_name) parts.push(item.project_name);
      if (item.task_title) parts.push(`Task: ${item.task_title}`);
      return parts.length > 0 ? parts.join(" → ") : null;
    },
  },
  projects: {
    title: "Overdue Projects",
    fetchFn: getOverdueProjects,
    getItemPath: (id: number) => `/projects/${id}`,
    getContext: (item: OverdueItem) => item.department_name ? `Department: ${item.department_name}` : null,
  },
};

export function OverdueViewAllPage({ type: propType }: OverdueViewAllPageProps) {
  const { type: paramType } = useParams<{ type: string }>();
  const navigate = useNavigate();

  const type = (propType || paramType || "tasks") as "tasks" | "subtasks" | "projects";
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.tasks;

  const [items, setItems] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await config.fetchFn();
        setItems(data);
      } catch (err: any) {
        setError(err?.message || "Failed to load overdue items.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [type]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading overdue items...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm mb-4">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700 font-semibold">{error}</span>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg bg-white hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sorted by days overdue (highest first)
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={36} className="text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-muted-foreground">Nothing overdue</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const context = config.getContext(item);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-red-50/40 transition-colors cursor-pointer"
                  onClick={() => navigate(config.getItemPath(item.id))}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                    {context && (
                      <p className="text-xs text-muted-foreground mt-0.5">{context}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {item.status && <StatusBadge status={item.status} />}
                    <span className="text-xs font-semibold text-red-600">
                      {item.days_overdue} {item.days_overdue === 1 ? "day" : "days"} overdue
                    </span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
