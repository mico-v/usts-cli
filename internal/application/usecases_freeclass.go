package application

import (
	"context"
	"sort"
	"strconv"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

const (
	weekMax    = 30
	weekdayMax = 7
	sectionMax = 13
)

type FreeClassroomsQuery struct {
	XNM      string
	XQM      string
	Week     string
	Weekday  string
	Section  string
	Campus   string
	Type     string
	Building string
	Name     string
	MinSeats *int
}

type FreeClassroomsCriteria struct {
	Weeks    []int  `json:"weeks"`
	Weekdays []int  `json:"weekdays"`
	Sections []int  `json:"sections"`
	Campus   string `json:"campus,omitempty"`
	Type     string `json:"type,omitempty"`
	Building string `json:"building,omitempty"`
	Name     string `json:"name,omitempty"`
	MinSeats *int   `json:"minSeats,omitempty"`
}

type FreeClassroomsView struct {
	Items    []domain.FreeClassroom
	Total    int
	Criteria FreeClassroomsCriteria
}

func ParseNumberList(spec, label string, max int) ([]int, error) {
	seen := map[int]bool{}
	for _, raw := range strings.FieldsFunc(spec, func(r rune) bool { return r == ',' || r == '，' }) {
		text := strings.TrimSpace(raw)
		if text == "" {
			continue
		}
		var from, to int
		var err error
		if strings.ContainsAny(text, "-~～至") {
			parts := strings.FieldsFunc(text, func(r rune) bool { return r == '-' || r == '~' || r == '～' || r == '至' })
			if len(parts) != 2 {
				return nil, invalidNumberList(label, max, text)
			}
			from, err = strconv.Atoi(strings.TrimSpace(parts[0]))
			if err != nil {
				return nil, invalidNumberList(label, max, text)
			}
			to, err = strconv.Atoi(strings.TrimSpace(parts[1]))
			if err != nil {
				return nil, invalidNumberList(label, max, text)
			}
		} else {
			from, err = strconv.Atoi(text)
			if err != nil {
				return nil, invalidNumberList(label, max, text)
			}
			to = from
		}
		if from < 1 || to > max || from > to {
			return nil, invalidNumberList(label, max, text)
		}
		for value := from; value <= to; value++ {
			seen[value] = true
		}
	}
	values := make([]int, 0, len(seen))
	for value := range seen {
		values = append(values, value)
	}
	sort.Ints(values)
	return values, nil
}

func ReadFreeClassrooms(
	ctx context.Context,
	gateway FreeClassroomGateway,
	query FreeClassroomsQuery,
) (FreeClassroomsView, error) {
	criteria := FreeClassroomsCriteria{
		Campus: query.Campus, Type: query.Type, Building: query.Building,
		Name: query.Name, MinSeats: query.MinSeats,
		Weeks: make([]int, 0), Weekdays: make([]int, 0), Sections: make([]int, 0),
	}
	var err error
	if query.Week != "" {
		criteria.Weeks, err = ParseNumberList(query.Week, "周次", weekMax)
		if err != nil {
			return FreeClassroomsView{}, err
		}
	}
	if query.Weekday != "" {
		criteria.Weekdays, err = ParseNumberList(query.Weekday, "星期", weekdayMax)
		if err != nil {
			return FreeClassroomsView{}, err
		}
	}
	if query.Section != "" {
		criteria.Sections, err = ParseNumberList(query.Section, "节次", sectionMax)
		if err != nil {
			return FreeClassroomsView{}, err
		}
	}
	if err := requireWholeTimeSlot(criteria); err != nil {
		return FreeClassroomsView{}, err
	}
	items, err := gateway.QueryFreeClassrooms(ctx, domain.FreeClassroomQuery{
		XNM: query.XNM, XQM: query.XQM,
		Weeks: criteria.Weeks, Weekdays: criteria.Weekdays, Sections: criteria.Sections,
	})
	if err != nil {
		return FreeClassroomsView{}, err
	}
	if items == nil {
		items = make([]domain.FreeClassroom, 0)
	}
	total := len(items)
	filtered := items[:0]
	for _, room := range items {
		if matchesRoom(room, criteria) {
			filtered = append(filtered, room)
		}
	}
	return FreeClassroomsView{Items: filtered, Total: total, Criteria: criteria}, nil
}

func matchesRoom(room domain.FreeClassroom, criteria FreeClassroomsCriteria) bool {
	if !containsText(room.Campus, criteria.Campus) ||
		!containsText(room.Category, criteria.Type) ||
		!containsText(room.Building, criteria.Building) {
		return false
	}
	if criteria.Name != "" && !containsString(room.Name, criteria.Name) && !containsText(room.Code, criteria.Name) {
		return false
	}
	if criteria.MinSeats != nil {
		seats := 0.0
		if room.Seats != nil {
			seats = *room.Seats
		}
		if seats < float64(*criteria.MinSeats) {
			return false
		}
	}
	return true
}

func containsText(value *string, keyword string) bool {
	if keyword == "" {
		return true
	}
	if value == nil {
		return false
	}
	return containsString(*value, keyword)
}

func containsString(value, keyword string) bool {
	if keyword == "" {
		return true
	}
	return strings.Contains(strings.ToLower(value), strings.ToLower(strings.TrimSpace(keyword)))
}

func requireWholeTimeSlot(criteria FreeClassroomsCriteria) error {
	given := 0
	for _, length := range []int{len(criteria.Weeks), len(criteria.Weekdays), len(criteria.Sections)} {
		if length > 0 {
			given++
		}
	}
	if given == 0 || given == 3 {
		return nil
	}
	return domain.ConfigError("时段过滤要同时给出周次、星期、节次：服务端只认三者齐全的组合，少给一项会退化成「不按时段过滤」")
}

func invalidNumberList(label string, max int, value string) error {
	return domain.ConfigError("%s取值无效：%s。应为 1~%d 的数字或区间，如 3、1-4、3,5,7", label, value, max)
}
