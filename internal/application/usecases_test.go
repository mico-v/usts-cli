package application

import (
	"context"
	"testing"

	"github.com/mico-v/usts-cli/internal/domain"
)

type fakeScheduleGateway struct {
	items []domain.ScheduleItem
}

func (f fakeScheduleGateway) QuerySchedule(context.Context, string, string) ([]domain.ScheduleItem, error) {
	return f.items, nil
}

func intPointer(value int) *int { return &value }

func TestReadScheduleGroupsFixedSlots(t *testing.T) {
	gateway := fakeScheduleGateway{items: []domain.ScheduleItem{
		{CourseName: "A", Weekday: intPointer(3), StartSection: intPointer(5), EndSection: intPointer(6)},
		{CourseName: "B", Weekday: intPointer(1), StartSection: intPointer(3), EndSection: intPointer(4)},
		{CourseName: "C"},
	}}
	view, err := ReadSchedule(context.Background(), gateway, domain.Term{AcademicYear: "2026", Semester: "3"})
	if err != nil {
		t.Fatal(err)
	}
	if view.Total != 3 || len(view.Days) != 2 || len(view.Untimed) != 1 {
		t.Fatalf("unexpected view: %#v", view)
	}
	if view.Days[0].Day != 1 || view.Days[0].Items[0].CourseName != "B" {
		t.Fatalf("unexpected first day: %#v", view.Days[0])
	}
}

func TestParseNumberList(t *testing.T) {
	got, err := ParseNumberList("1-3,5,5", "周次", 30)
	if err != nil {
		t.Fatal(err)
	}
	want := []int{1, 2, 3, 5}
	if len(got) != len(want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("got %#v, want %#v", got, want)
		}
	}
	if _, err := ParseNumberList("0,31", "周次", 30); err == nil {
		t.Fatal("expected out-of-range list to fail")
	}
}

type fakeFreeClassGateway struct {
	items []domain.FreeClassroom
}

func (f fakeFreeClassGateway) QueryFreeClassrooms(context.Context, domain.FreeClassroomQuery) ([]domain.FreeClassroom, error) {
	return f.items, nil
}

func TestReadFreeClassroomsFiltersLocally(t *testing.T) {
	seats := 80.0
	smallSeats := 30.0
	campus := "石湖"
	building := "石5"
	gateway := fakeFreeClassGateway{items: []domain.FreeClassroom{
		{Name: "103", Campus: &campus, Building: &building, Seats: &seats},
		{Name: "104", Campus: &campus, Building: &building, Seats: &smallSeats},
	}}
	minSeats := 60
	view, err := ReadFreeClassrooms(context.Background(), gateway, FreeClassroomsQuery{
		XNM: "2026", XQM: "3", Week: "3", Weekday: "3", Section: "5-6",
		Building: "石5", MinSeats: &minSeats,
	})
	if err != nil {
		t.Fatal(err)
	}
	if view.Total != 2 || len(view.Items) != 1 || view.Items[0].Name != "103" {
		t.Fatalf("unexpected view: %#v", view)
	}
}

func TestReadFreeClassroomsRequiresWholeTimeSlot(t *testing.T) {
	_, err := ReadFreeClassrooms(context.Background(), fakeFreeClassGateway{}, FreeClassroomsQuery{
		XNM: "2026", XQM: "3", Week: "3",
	})
	if err == nil {
		t.Fatal("expected partial time slot to fail")
	}
}

func TestSelectCascadeRejectsAllWithExplicitFilter(t *testing.T) {
	_, err := SelectCascade(domain.CascadeOptions{}, CascadeInput{All: true, Grade: "2025"})
	if err == nil {
		t.Fatal("expected conflicting filters to fail")
	}
}

type emptyScoresGateway struct{}

func (emptyScoresGateway) QueryScores(context.Context, string, string, map[string]string) ([]domain.ScoreItem, error) {
	return nil, nil
}

func TestEmptyScoreResultsStayEmptyArrays(t *testing.T) {
	view, err := ReadScores(context.Background(), emptyScoresGateway{}, ScoresQuery{XNM: "2026", XQM: "3"})
	if err != nil {
		t.Fatal(err)
	}
	if view.Items == nil {
		t.Fatal("items must be an empty slice, not nil")
	}
}

type emptyPlanGateway struct{}

func (emptyPlanGateway) GetPlanOptions(context.Context) (domain.CascadeOptions, error) {
	return domain.CascadeOptions{}, nil
}

func (emptyPlanGateway) QueryPlan(context.Context, domain.PlanFilter) ([]domain.PlanEntry, error) {
	return nil, nil
}

func (emptyPlanGateway) QueryPlanCourses(context.Context, string, string) ([]domain.PlanCourse, error) {
	return nil, nil
}

func TestEmptyPlanResultsStayEmptyArrays(t *testing.T) {
	view, err := ReadPlan(context.Background(), emptyPlanGateway{}, PlanQuery{All: true})
	if err != nil {
		t.Fatal(err)
	}
	if view.Entries == nil || view.Courses == nil {
		t.Fatalf("entries/courses must be empty slices: %#v", view)
	}
}

func TestEmptyFreeClassroomResultHasEmptyCriteriaArrays(t *testing.T) {
	view, err := ReadFreeClassrooms(context.Background(), fakeFreeClassGateway{}, FreeClassroomsQuery{XNM: "2026", XQM: "3"})
	if err != nil {
		t.Fatal(err)
	}
	if view.Items == nil || view.Criteria.Weeks == nil || view.Criteria.Weekdays == nil || view.Criteria.Sections == nil {
		t.Fatalf("empty result must use arrays: %#v", view)
	}
}
