package application

import (
	"context"

	"github.com/mico-v/usts-cli/internal/domain"
)

type SessionGateway interface {
	EnsureValidSession(ctx context.Context) domain.SessionLookup
	ProbeSession(ctx context.Context) domain.SessionState
	LocalSession() domain.LocalSessionInfo
	LastRecovery() (domain.RecoveryResult, bool)
}

type ScoresGateway interface {
	QueryScores(ctx context.Context, xnm, xqm string, extra map[string]string) ([]domain.ScoreItem, error)
}

type RecordsGateway interface {
	QueryExams(ctx context.Context, xnm, xqm string) ([]domain.ExamItem, error)
	QueryCourseList(ctx context.Context, xnm, xqm string) ([]domain.CourseListItem, error)
	QueryNotifications(ctx context.Context) ([]domain.NotificationItem, error)
	QuerySelectedCourses(ctx context.Context, xnm, xqm string) ([]domain.SelectedCourseItem, error)
	QueryProfile(ctx context.Context) (domain.ProfileInfo, error)
}

type ScheduleGateway interface {
	QuerySchedule(ctx context.Context, xnm, xqm string) ([]domain.ScheduleItem, error)
}

type ClassScheduleGateway interface {
	GetBjkbdyOptions(ctx context.Context) (domain.ClassScheduleView, error)
	GetMajorsByCollege(ctx context.Context, collegeID string) ([]domain.SelectOption, error)
	GetClassesByMajor(ctx context.Context, collegeID, majorID, gradeID string) ([]domain.SelectOption, error)
	QueryClassSchedule(ctx context.Context, query domain.ClassScheduleQuery) ([]domain.ClassScheduleItem, []string, error)
}

type AcademiaGateway interface {
	QueryAcademia(ctx context.Context) (domain.AcademiaSummary, error)
	QueryAcademiaCategory(ctx context.Context, categoryID string) ([]domain.AcademiaCourseItem, error)
}

type GpaGateway interface {
	QueryGpa(ctx context.Context) (domain.GpaSummary, error)
}

type FreeClassroomGateway interface {
	QueryFreeClassrooms(ctx context.Context, query domain.FreeClassroomQuery) ([]domain.FreeClassroom, error)
}

type WarningGateway interface {
	QueryWarning(ctx context.Context) (domain.WarningStatus, error)
}

type PlanGateway interface {
	GetPlanOptions(ctx context.Context) (domain.CascadeOptions, error)
	QueryPlan(ctx context.Context, filter domain.PlanFilter) ([]domain.PlanEntry, error)
	QueryPlanCourses(ctx context.Context, planID, courseCode string) ([]domain.PlanCourse, error)
}

type PaymentGateway interface {
	QueryPayments(ctx context.Context, xnm, xqm string) ([]domain.PaymentItem, error)
}

type MinorScheduleGateway interface {
	GetMinorScheduleOptions(ctx context.Context, kind domain.MinorProgramKind) (domain.CascadeOptions, error)
	QueryMinorSchedules(ctx context.Context, query domain.MinorScheduleQuery) ([]domain.MinorScheduleEntry, error)
}

type ScheduleDocumentGateway interface {
	DownloadSchedulePDF(ctx context.Context, xnm, xqm, name string) ([]byte, error)
}

type AcademiaDocumentGateway interface {
	DownloadAcademiaPDF(ctx context.Context) ([]byte, error)
}
