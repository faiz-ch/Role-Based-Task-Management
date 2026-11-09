"""
Approvals (Phase B).

  ApprovalType      a kind of approval, set up once on the Roles & Approvals page
                    (e.g. Budget → approved by the CFO role). "Budget" is built in.
  approvers         who may decide: every member of a role (approval_type_role)
                    and/or named people (approval_type_user).
  ProjectApproval   one approval a project needs (the project ticks the types it needs).
                    Holds the current request and decision.
  ApprovalEvent     permanent history: requested / approved / rejected / sent back.
"""
import enum

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Numeric, Table, UniqueConstraint, func, false,
)
from sqlalchemy.orm import relationship

from app.database import Base

BUDGET_KEY = "budget"

approval_type_role = Table(
    "approval_type_role",
    Base.metadata,
    Column("approval_type_id", Integer, ForeignKey("approval_types.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

approval_type_user = Table(
    "approval_type_user",
    Base.metadata,
    Column("approval_type_id", Integer, ForeignKey("approval_types.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class ApprovalStatus(str, enum.Enum):
    NOT_REQUESTED = "Not requested"
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    SENT_BACK = "Sent back"


class ApprovalType(Base):
    __tablename__ = "approval_types"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(40), unique=True, nullable=True)  # "budget" for the built-in type
    name = Column(String(120), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    requires_amount = Column(Boolean, nullable=False, default=False, server_default=false())
    requires_attachment = Column(Boolean, nullable=False, default=False, server_default=false())
    mandatory = Column(Boolean, nullable=False, default=False, server_default=false())
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    roles = relationship("Role", secondary=approval_type_role, lazy="selectin")
    users = relationship("User", secondary=approval_type_user, lazy="selectin")

    @property
    def is_builtin(self) -> bool:
        return self.key is not None


class ProjectApproval(Base):
    __tablename__ = "project_approvals"
    __table_args__ = (UniqueConstraint("project_id", "approval_type_id", name="uq_project_approval_type"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    approval_type_id = Column(Integer, ForeignKey("approval_types.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default=ApprovalStatus.NOT_REQUESTED.value)

    # current request
    amount = Column(Numeric(14, 2), nullable=True)
    reason = Column(Text, nullable=True)
    attachment_name = Column(String, nullable=True)
    attachment_path = Column(String, nullable=True)
    attachment_type = Column(String, nullable=True)
    requested_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_at = Column(DateTime(timezone=True), nullable=True)

    # decision
    approved_amount = Column(Numeric(14, 2), nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decision_comment = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    approval_type = relationship("ApprovalType", lazy="selectin")
    project = relationship("Project")
    requester = relationship("User", foreign_keys=[requested_by], lazy="selectin")
    decider = relationship("User", foreign_keys=[decided_by], lazy="selectin")
    events = relationship("ApprovalEvent", order_by="ApprovalEvent.id", cascade="all, delete-orphan", lazy="selectin")


class ApprovalEvent(Base):
    __tablename__ = "approval_events"

    id = Column(Integer, primary_key=True, index=True)
    project_approval_id = Column(Integer, ForeignKey("project_approvals.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(20), nullable=False)  # requested | approved | rejected | sent_back
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    amount = Column(Numeric(14, 2), nullable=True)
    comment = Column(Text, nullable=True)
    attachment_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    actor = relationship("User", lazy="selectin")
