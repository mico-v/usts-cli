package domain

type ScoreItem struct {
	CourseName    string   `json:"courseName"`
	CourseCode    string   `json:"courseCode"`
	CourseNature  string   `json:"courseNature"`
	Credit        *float64 `json:"credit"`
	Score         string   `json:"score"`
	GPA           *float64 `json:"gpa"`
	College       string   `json:"college"`
	Teacher       string   `json:"teacher"`
	AssessMethod  string   `json:"assessMethod"`
	ExamType      string   `json:"examType"`
	AcademicYear  string   `json:"academicYear"`
	Semester      string   `json:"semester"`
	ClassName     string   `json:"className"`
	Major         string   `json:"major"`
	TeachingClass string   `json:"teachingClass"`
}

type ExamItem struct {
	CourseName string `json:"courseName"`
	ExamTime   string `json:"examTime"`
	Location   string `json:"location"`
	Seat       string `json:"seat"`
	ExamType   string `json:"examType"`
}

type CourseListItem struct {
	CourseName    string `json:"courseName"`
	CourseCode    string `json:"courseCode"`
	Credit        string `json:"credit"`
	Teacher       string `json:"teacher"`
	TeachingClass string `json:"teachingClass"`
}

type NotificationItem struct {
	Title     *string `json:"title"`
	Type      *string `json:"type"`
	Content   *string `json:"content"`
	CreatedAt *string `json:"createdAt"`
	Unread    *bool   `json:"unread"`
}

type SelectedCourseItem struct {
	CourseID       *string  `json:"courseId"`
	ClassID        *string  `json:"classId"`
	Title          *string  `json:"title"`
	Teacher        *string  `json:"teacher"`
	Credit         *float64 `json:"credit"`
	Category       *string  `json:"category"`
	Capacity       *float64 `json:"capacity"`
	SelectedNumber *float64 `json:"selectedNumber"`
	Place          *string  `json:"place"`
	Time           *string  `json:"time"`
}

type ProfileInfo struct {
	Username       string  `json:"username"`
	DisplayName    string  `json:"displayName"`
	StudentID      string  `json:"studentId"`
	ClassName      string  `json:"className"`
	College        string  `json:"college"`
	Major          string  `json:"major"`
	Grade          string  `json:"grade"`
	EnrollmentYear int     `json:"enrollmentYear"`
	IDCard         *string `json:"idCard"`
	Phone          *string `json:"phone"`
	Email          *string `json:"email"`
}

type ScheduleItem struct {
	CourseName   string   `json:"courseName"`
	Teacher      *string  `json:"teacher"`
	ClassName    *string  `json:"className"`
	Campus       *string  `json:"campus"`
	Credit       *float64 `json:"credit"`
	Weeks        *string  `json:"weeks"`
	CourseType   *string  `json:"courseType"`
	AssessMethod *string  `json:"assessMethod"`
	AcademicYear string   `json:"academicYear"`
	Weekday      *int     `json:"weekday"`
	StartSection *int     `json:"startSection"`
	EndSection   *int     `json:"endSection"`
}

type SelectOption struct {
	Value string         `json:"value"`
	Label string         `json:"label"`
	Meta  map[string]any `json:"meta,omitempty"`
}

type CascadeDefaults struct {
	CollegeID string `json:"collegeId"`
	GradeID   string `json:"gradeId"`
	MajorID   string `json:"majorId"`
}

type CascadeOptions struct {
	Colleges []SelectOption  `json:"colleges"`
	Grades   []SelectOption  `json:"grades"`
	Majors   []SelectOption  `json:"majors"`
	Defaults CascadeDefaults `json:"defaults"`
}

type ClassScheduleQuery struct {
	XNM         string `json:"xnm"`
	XQM         string `json:"xqm"`
	CampusID    string `json:"campusId"`
	GradeID     string `json:"gradeId"`
	MajorID     string `json:"majorId"`
	ClassID     string `json:"classId"`
	ClassNumber string `json:"classNumber"`
	ClassName   string `json:"className"`
	MajorName   string `json:"majorName"`
	CollegeName string `json:"collegeName"`
	GradeName   string `json:"gradeName"`
}

type ClassScheduleItem struct {
	CourseName       string   `json:"courseName"`
	Teacher          *string  `json:"teacher"`
	TeacherTitle     *string  `json:"teacherTitle"`
	TeachingClass    *string  `json:"jxbmc"`
	ClassComposition *string  `json:"jxbzc"`
	Campus           *string  `json:"campus"`
	Room             *string  `json:"room"`
	Credit           *float64 `json:"credit"`
	Weeks            *string  `json:"weeks"`
	AssessMethod     *string  `json:"assessMethod"`
	CourseNature     *string  `json:"courseNature"`
	Weekday          *int     `json:"weekday"`
	StartSection     *int     `json:"startSection"`
	EndSection       *int     `json:"endSection"`
}

type ClassScheduleView struct {
	Colleges      []SelectOption `json:"colleges"`
	Campuses      []SelectOption `json:"campuses"`
	Grades        []SelectOption `json:"grades"`
	DefaultGrade  string         `json:"defaultGrade"`
	DefaultCampus string         `json:"defaultCampus"`
}

type GpaSummary struct {
	GPA           *float64 `json:"gpa"`
	AverageScore  *float64 `json:"averageScore"`
	TotalCredits  *float64 `json:"totalCredits"`
	EarnedCredits *float64 `json:"earnedCredits"`
	RawText       []string `json:"rawText"`
}

type AcademiaCategory struct {
	ID              *string  `json:"id"`
	Name            string   `json:"name"`
	RequiredCredits *float64 `json:"requiredCredits"`
	EarnedCredits   *float64 `json:"earnedCredits"`
	MissingCredits  *float64 `json:"missingCredits"`
	DetailAvailable bool     `json:"detailAvailable"`
}

type AcademiaCourseItem struct {
	CourseID    *string  `json:"courseId"`
	Title       *string  `json:"title"`
	Credit      *float64 `json:"credit"`
	Category    *string  `json:"category"`
	Nature      *string  `json:"nature"`
	Grade       *string  `json:"grade"`
	MaxGrade    *string  `json:"maxGrade"`
	GPA         *float64 `json:"gpa"`
	DisplayTerm *string  `json:"displayTerm"`
	Planned     bool     `json:"planned"`
}

type AcademiaSummary struct {
	StudentID              *string            `json:"studentId"`
	GPA                    *float64           `json:"gpa"`
	PlannedCourses         *int               `json:"plannedCourses"`
	PassedCourses          *int               `json:"passedCourses"`
	FailedCourses          *int               `json:"failedCourses"`
	UnlearnedCourses       *int               `json:"unlearnedCourses"`
	InProgressCourses      *int               `json:"inProgressCourses"`
	UnplannedPassedCourses *int               `json:"unplannedPassedCourses"`
	UnplannedFailedCourses *int               `json:"unplannedFailedCourses"`
	Categories             []AcademiaCategory `json:"categories"`
	RawText                []string           `json:"rawText"`
}

type FreeClassroom struct {
	Code       *string  `json:"code"`
	Name       string   `json:"name"`
	Category   *string  `json:"category"`
	Campus     *string  `json:"campus"`
	Building   *string  `json:"building"`
	Seats      *float64 `json:"seats"`
	Borrowable *string  `json:"borrowable"`
}

type FreeClassroomQuery struct {
	XNM      string `json:"xnm"`
	XQM      string `json:"xqm"`
	Weeks    []int  `json:"weeks,omitempty"`
	Weekdays []int  `json:"weekdays,omitempty"`
	Sections []int  `json:"sections,omitempty"`
}

type PlanEntry struct {
	ID              *string  `json:"id"`
	Grade           *string  `json:"grade"`
	MajorCode       *string  `json:"majorCode"`
	Major           *string  `json:"major"`
	Category        *string  `json:"category"`
	TaskClass       *string  `json:"taskClass"`
	PlannedStudents *float64 `json:"plannedStudents"`
	Campus          *string  `json:"campus"`
	CourseCount     *float64 `json:"courseCount"`
	TotalCredits    *float64 `json:"totalCredits"`
	SchoolLength    *string  `json:"schoolLength"`
}

type PlanCourse struct {
	Code          *string  `json:"code"`
	Name          *string  `json:"name"`
	Credit        *float64 `json:"credit"`
	Hours         *float64 `json:"hours"`
	Nature        *string  `json:"nature"`
	Category      *string  `json:"category"`
	SuggestedTerm *string  `json:"suggestedTerm"`
	AssessMethod  *string  `json:"assessMethod"`
	Department    *string  `json:"department"`
}

type PlanFilter struct {
	CollegeID string `json:"collegeId,omitempty"`
	GradeID   string `json:"gradeId,omitempty"`
	MajorID   string `json:"majorId,omitempty"`
}

type PaymentItem struct {
	AcademicYear *string `json:"academicYear"`
	Semester     *string `json:"semester"`
	Type         *string `json:"type"`
	Item         *string `json:"item"`
	Amount       *string `json:"amount"`
	Status       *string `json:"status"`
	PaidAt       *string `json:"paidAt"`
	OrderID      *string `json:"orderId"`
	PayStart     *string `json:"payStart"`
	PayEnd       *string `json:"payEnd"`
}

type WarningStatus struct {
	HasWarning bool       `json:"hasWarning"`
	Messages   []string   `json:"messages"`
	Headers    []string   `json:"headers"`
	Rows       [][]string `json:"rows"`
}

type MinorProgramKind string

const (
	MinorMicroMajor MinorProgramKind = "micro-major"
	MinorDualDegree MinorProgramKind = "dual-degree"
	MinorMinor      MinorProgramKind = "minor"
)

type MinorScheduleEntry struct {
	College *string `json:"college"`
	Grade   *string `json:"grade"`
	Major   *string `json:"major"`
	Name    *string `json:"name"`
}

type MinorScheduleQuery struct {
	XNM       string           `json:"xnm"`
	XQM       string           `json:"xqm"`
	Kind      MinorProgramKind `json:"kind"`
	CollegeID string           `json:"collegeId,omitempty"`
	GradeID   string           `json:"gradeId,omitempty"`
	MajorID   string           `json:"majorId,omitempty"`
}
