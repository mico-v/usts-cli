package domain

import (
	"testing"
	"time"
)

func TestCurrentTerm(t *testing.T) {
	tests := []struct {
		date time.Time
		want Term
	}{
		{time.Date(2026, 8, 1, 0, 0, 0, 0, time.Local), Term{AcademicYear: "2026", Semester: "3"}},
		{time.Date(2026, 2, 1, 0, 0, 0, 0, time.Local), Term{AcademicYear: "2025", Semester: "12"}},
		{time.Date(2026, 1, 31, 0, 0, 0, 0, time.Local), Term{AcademicYear: "2025", Semester: "3"}},
	}
	for _, test := range tests {
		if got := CurrentTerm(test.date); got != test.want {
			t.Fatalf("CurrentTerm(%s) = %#v, want %#v", test.date, got, test.want)
		}
	}
}

func TestResolveTerm(t *testing.T) {
	now := time.Date(2026, 10, 1, 0, 0, 0, 0, time.Local)
	tests := []struct {
		xnm, xqm string
		want     Term
	}{
		{"", "", Term{AcademicYear: "2026", Semester: "3"}},
		{"2025", "", Term{AcademicYear: "2025", Semester: ""}},
		{"2025", "12", Term{AcademicYear: "2025", Semester: "12"}},
	}
	for _, test := range tests {
		got, err := ResolveTerm(test.xnm, test.xqm, now)
		if err != nil {
			t.Fatalf("ResolveTerm(%q, %q): %v", test.xnm, test.xqm, err)
		}
		if got != test.want {
			t.Fatalf("ResolveTerm(%q, %q) = %#v, want %#v", test.xnm, test.xqm, got, test.want)
		}
	}
}

func TestValidateTermRejectsInvalidValues(t *testing.T) {
	if _, err := ValidateTerm(Term{AcademicYear: "26", Semester: "3"}); !IsCode(err, CodeConfiguration) {
		t.Fatalf("expected configuration error for bad year, got %v", err)
	}
	if _, err := ValidateTerm(Term{AcademicYear: "2026", Semester: "4"}); !IsCode(err, CodeConfiguration) {
		t.Fatalf("expected configuration error for bad semester, got %v", err)
	}
}
