package application

import (
	"context"
	"strconv"

	"github.com/mico-v/usts-cli/internal/domain"
)

type GpaRow struct {
	Field string
	Value string
}

type GpaView struct {
	Summary domain.GpaSummary
	Rows    []GpaRow
}

func ReadGpa(ctx context.Context, gateway GpaGateway) (GpaView, error) {
	summary, err := gateway.QueryGpa(ctx)
	if err != nil {
		return GpaView{}, err
	}
	if summary.RawText == nil {
		summary.RawText = make([]string, 0)
	}
	var rows []GpaRow
	add := func(field string, value *float64) {
		if value != nil {
			rows = append(rows, GpaRow{Field: field, Value: strconv.FormatFloat(*value, 'f', -1, 64)})
		}
	}
	add("gpa", summary.GPA)
	add("averageScore", summary.AverageScore)
	add("totalCredits", summary.TotalCredits)
	add("earnedCredits", summary.EarnedCredits)
	return GpaView{Summary: summary, Rows: rows}, nil
}
