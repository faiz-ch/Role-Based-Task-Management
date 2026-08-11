import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Project, Task, UserType } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { PriBadge } from "../../components/PriBadge";
import { Dlg } from "../../components/Dlg";
import { FldSelect } from "../../components/FldSelect";
import { Av } from "../../components/Av";
import { DatePicker } from "../../components/DatePicker";

interface TasksTabProps {
  project: Project;
  tasks: Task[];
  teamMembers: UserType[];
  onCreateTask: (taskData: any, teamIds: number[], leadId: string) => Promise<void>;
}

interface TaskForm {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  assigneeId: number | null;
  selectedTeamIds: number[];
  selectedLeadId: string;
}

export function TasksTab({ project, tasks, teamMembers, onCreateTask }: TasksTabProps) {
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskTeamSearch, setTaskTeamSearch] = useState("");
  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    assigneeId: null,
    selectedTeamIds: [],
    selectedLeadId: "",
  });

  const projectTasks = tasks.filter((t) => t.projectId === project.id);

  function toggleTaskTeamMember(userId: number) {
    setTaskForm((prev) => {
      const newTeamIds = prev.selectedTeamIds.includes(userId)
        ? prev.selectedTeamIds.filter((id) => id !== userId)
        : [...prev.selectedTeamIds, userId];
      
      if (prev.assigneeId === userId && prev.selectedLeadId === userId.toString()) {
        return {
          ...prev,
          selectedTeamIds: newTeamIds,
          assigneeId: null,
          selectedLeadId: "",
        };
      }
      
      return { ...prev, selectedTeamIds: newTeamIds };
    });
  }

  async function handleCreateTask() {
    if (!taskForm.title.trim()) return;
    try {
      await onCreateTask(taskForm, taskForm.selectedTeamIds, taskForm.selectedLeadId);
      setShowNewTask(false);
      setTaskForm({
        title: "",
        description: "",
        priority: "Medium",
        dueDate: "",
        assigneeId: null,
        selectedTeamIds: [],
        selectedLeadId: "",
      });
    } catch (err: any) {
      console.error("Failed to create task:", err);
    }
  }

  function openNewTask() {
    setTaskForm({
      title: "",
      description: "",
      priority: "Medium",
      dueDate: "",
      assigneeId: null,
      selectedTeamIds: [],
      selectedLeadId: "",
    });
    setShowNewTask(true);
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
          <button
            onClick={openNewTask}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={12} /> New Task
          </button>
        </div>
        {projectTasks.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No tasks yet
          </div>
        ) : (
          <div className="space-y-2">
            {projectTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={task.status} />
                    <PriBadge priority={task.priority} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewTask && (
        <Dlg title="New Task" onClose={() => setShowNewTask(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <DatePicker
                label="Due Date"
                value={taskForm.dueDate}
                onChange={(value) => setTaskForm((f) => ({ ...f, dueDate: value }))}
                min={new Date().toISOString().slice(0, 16)}
                max={project?.dueDate ? project.dueDate.slice(0, 16) : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Task Team
              </span>
              <input
                type="text"
                placeholder="Search team members..."
                value={taskTeamSearch}
                onChange={(e) => setTaskTeamSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 mb-2"
              />
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No team members in this project. Add team members first.
                  </p>
                ) : (
                  teamMembers
                    .filter((member) => member.name.toLowerCase().includes(taskTeamSearch.toLowerCase()))
                    .map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={taskForm.selectedTeamIds.includes(member.id)}
                        onChange={() => toggleTaskTeamMember(member.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={member.name} size="sm" />
                      <span className="text-sm text-foreground">{member.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {taskForm.selectedTeamIds.length > 0 && (
              <FldSelect
                label="Select Task Lead"
                value={taskForm.selectedLeadId}
                onChange={(e) => {
                  const leadId = e.target.value;
                  const leadIdNum = leadId === "" ? null : Number(leadId);
                  setTaskForm((prev) => ({
                    ...prev,
                    selectedLeadId: leadId,
                    assigneeId: leadIdNum,
                    selectedTeamIds: leadIdNum && !prev.selectedTeamIds.includes(leadIdNum)
                      ? [...prev.selectedTeamIds, leadIdNum]
                      : prev.selectedTeamIds,
                  }));
                }}
                options={[
                  { value: "", label: "Select lead" },
                  ...teamMembers
                    .filter((u) => taskForm.selectedTeamIds.includes(u.id))
                    .map((u) => ({ value: u.id.toString(), label: u.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowNewTask(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTask}
              disabled={!taskForm.title.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Task
            </button>
          </div>
        </Dlg>
      )}
    </>
  );
}