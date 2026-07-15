import React, { useState, useEffect } from "react";
import { Plus, AlertTriangle, Trash2 } from "lucide-react";
import { Department } from "../types";
import { getDepartments, createDepartment, deleteDepartment } from "../api/departments";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const fetched = await getDepartments();
        setDepartments(fetched);
      } catch (err: any) {
        setError(err?.message || "Failed to load departments.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleCreateDepartment() {
    if (!newName.trim()) return;
    try {
      setError(null);
      const nd = await createDepartment(newName.trim());
      setDepartments((prev) => [...prev, nd]);
      setNewName("");
      setShowNew(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create department.");
    }
  }

  async function handleDeleteDepartment(deptId: number) {
    try {
      setError(null);
      await deleteDepartment(deptId);
      setDepartments((prev) => prev.filter((d) => d.id !== deptId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete department.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading departments...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Departments</h1>
        <p className="text-sm text-muted-foreground">Organizational units for grouping users and tasks</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">All Departments</span>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={12} /> New Department
          </button>
        </div>
        <div className="divide-y divide-border">
          {departments.length === 0 ? (
            <div className="px-4 py-12 text-sm text-muted-foreground text-center">
              No departments yet. Create one to get started.
            </div>
          ) : (
            departments.map((dept) => (
              <div
                key={dept.id}
                className="flex items-center justify-between px-4 py-3.5 text-sm text-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="font-medium">{dept.name}</span>
                <button
                  onClick={() => handleDeleteDepartment(dept.id)}
                  className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                  title="Delete department"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {showNew && (
        <Dlg title="Create Department" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <FldInput
              label="Department name"
              placeholder="e.g. Engineering, Marketing"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Departments are used to group users and tasks for organizational purposes.
              Users can be assigned to departments, and tasks can be filtered by department.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDepartment}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Create Department
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
