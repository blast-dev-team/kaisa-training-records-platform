import enum


class AdminRole(str, enum.Enum):
    super_admin = "super"
    staff = "staff"


class AdminStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class AllowedEmailStatus(str, enum.Enum):
    pending = "pending"
    joined = "joined"
