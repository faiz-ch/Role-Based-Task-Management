"""
Budget allocations (Phase C).

The project's budget is what the Budget approval approved, plus every approved
Budget increase. The project lead splits it among tasks (task_budgets); a task's
budget can be split among its subtasks (subtask_budgets). Amounts are PKR, exact.
"""
from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, func

from app.database import Base

BUDGET_INCREASE_KEY = "budget_increase"


class TaskBudget(Base):
    __tablename__ = "task_budgets"

    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    amount = Column(Numeric(14, 2), nullable=False)
    set_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SubtaskBudget(Base):
    __tablename__ = "subtask_budgets"

    subtask_id = Column(Integer, ForeignKey("subtasks.id", ondelete="CASCADE"), primary_key=True)
    amount = Column(Numeric(14, 2), nullable=False)
    set_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
