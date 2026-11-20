import enum


class RecordSource(str, enum.Enum):
    internal = "internal"
    external = "external"


class CompletionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    canceled = "canceled"
