import enum


class RecordSource(str, enum.Enum):
    internal = "internal"
    external = "external"
    legacy_import = "legacy_import"


class CompletionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    canceled = "canceled"
