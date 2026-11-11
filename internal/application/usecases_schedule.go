package application

import (
	"context"
	"sort"

	"github.com/mico-v/usts-cli/internal/domain"
)

type ScheduleDay struct {
	Day   int                   `json:"day"`
	Items []domain.ScheduleItem `json:"items"`
}

type ScheduleView struct {
	Days    []ScheduleDay
	Untimed []domain.ScheduleItem
	Total   int
}

func HasFixedSlot(item domain.ScheduleItem) bool {
	return item.Weekday != nil && *item.Weekday > 0 && item.StartSection != nil && *item.StartSection > 0
}

func ReadSchedule(ctx context.Context, gateway ScheduleGateway, term domain.Term) (ScheduleView, error) {
	items, err := gateway.QuerySchedule(ctx, term.AcademicYear, term.Semester)
	if err != nil {
		return ScheduleView{}, err
	}
	days := make([]ScheduleDay, 0)
	for day := 1; day <= 7; day++ {
		var today []domain.ScheduleItem
		for _, item := range items {
			if HasFixedSlot(item) && *item.Weekday == day {
				today = append(today, item)
			}
		}
		sort.SliceStable(today, func(i, j int) bool {
			return *today[i].StartSection < *today[j].StartSection
		})
		if len(today) > 0 {
			days = append(days, ScheduleDay{Day: day, Items: today})
		}
	}
	untimed := make([]domain.ScheduleItem, 0)
	for _, item := range items {
		if !HasFixedSlot(item) {
			untimed = append(untimed, item)
		}
	}
	return ScheduleView{Days: days, Untimed: untimed, Total: len(items)}, nil
}
