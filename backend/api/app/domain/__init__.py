# Import all domain models here so Alembic can discover them.
# When adding a new domain with a model, add the import below.

from app.domain.audit.model import AuditLog  # noqa: F401
from app.domain.auth.model import (  # noqa: F401
    AdminAllowedEmail,
    AdminUser,
    UserSession,
)
from app.domain.certificate.model import (  # noqa: F401
    Certificate,
    CertificatePricingRule,
    CertificateRequest,
    CertificateVerificationLog,
)
from app.domain.identity.model import IdentityReview, IdentityVerification  # noqa: F401
from app.domain.institution.model import (  # noqa: F401
    TrainingCourse,
    TrainingInstitution,
)
from app.domain.payment.model import (  # noqa: F401
    PaymentAttempt,
    PaymentOrder,
    PaymentRefund,
    PaymentWebhookEvent,
)
from app.domain.trainee.model import (  # noqa: F401
    MembershipGrade,
    Trainee,
    TraineeGradeHistory,
)
from app.domain.training_record.model import TrainingRecord  # noqa: F401
from app.domain.user.model import User  # noqa: F401
