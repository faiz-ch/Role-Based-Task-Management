import React from "react";
import { Task } from "../../types";

interface TimelineTabProps {
  tasks: Task[];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-gray-400",
  "Review": "bg-blue-500",
  "Done": "bg-green-500",
  "Reschedule": "bg-orange-500",
};

const STATUS_BORDER_COLORS: Record<string, string> = {
  "To Do": "border-gray-400",
  "Review": "border-blue-500",
  "Done": "border-green-500",
  "Reschedule": "border-orange-500",
};

export function TimelineTab({ tasks }: TimelineTabProps) {
  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="text-sm text-muted-foreground text-center py-8">
          No tasks to display on timeline
        </div>
      </div>
    );
  }

  // Calculate timeline range
  const allDates = tasks.flatMap((task) => {
    const dates = [];
    if (task.createdAt) dates.push(new Date(task.createdAt));
    if (task.dueDate) dates.push(new Date(task.dueDate));
    return dates;
  });

  if (allDates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="text-sm text-muted-foreground text-center py-8">
          No dates available for timeline
        </div>
      </div>
    );
  }

  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

  // Add padding to the range
  minDate.setDate(minDate.getDate() - 2);
  maxDate.setDate(maxDate.getDate() + 2);

  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  function getTaskStartDate(task: Task): Date {
    if (task.dueDate) {
      return new Date(task.dueDate);
    }
    return new Date(task.createdAt);
  }

  function getTaskPosition(task: Task): { left: number; width: number } {
    const startDate = getTaskStartDate(task);
    const endDate = task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt);
    
    // Ensure end date is after start date
    if (endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }

    const startOffset = (startDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    const left = (startOffset / totalDays) * 100;
    const width = Math.max((duration / totalDays) * 100, 2); // Minimum 2% width

    return { left, width };
  }

  function generateDateHeaders() {
    const headers = [];
    const currentDate = new Date(minDate);
    
    while (currentDate <= maxDate) {
      headers.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return headers;
  }

  const dateHeaders = generateDateHeaders();

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">Timeline</h2>
      
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Date header */}
          <div className="flex border-b border-border pb-2 mb-4">
            <div className="w-48 flex-shrink-0 text-xs font-medium text-muted-foreground">
              Task
            </div>
            <div className="flex-1 relative">
              {dateHeaders.map((date, index) => {
                const showLabel = index % 7 === 0 || index === dateHeaders.length - 1;
                return (
                  <div
                    key={date.toISOString()}
                    className="absolute text-xs text-muted-foreground"
                    style={{
                      left: `${(index / dateHeaders.length) * 100}%`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {showLabel && fmtDate(date.toISOString())}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task bars */}
          <div className="space-y-3">
            {tasks.map((task) => {
              const { left, width } = getTaskPosition(task);
              const bgColor = STATUS_COLORS[task.status] || "bg-gray-400";
              const borderColor = STATUS_BORDER_COLORS[task.status] || "border-gray-400";

              return (
                <div key={task.id} className="flex items-center">
                  <div className="w-48 flex-shrink-0 pr-4">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.status}</p>
                  </div>
                  <div className="flex-1 relative h-8 bg-muted/30 rounded">
                    <div
                      className={`absolute top-1 bottom-1 rounded ${bgColor} ${borderColor} border-2`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${task.title}: ${fmtDate(task.createdAt)} - ${fmtDate(task.dueDate)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">Status:</span>
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${color}`} />
                <span className="text-xs text-muted-foreground">{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}