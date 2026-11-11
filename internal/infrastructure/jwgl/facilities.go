package jwgl

import (
	"context"
	"sort"
	"strconv"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func (c *Client) QueryFreeClassrooms(
	ctx context.Context,
	query domain.FreeClassroomQuery,
) ([]domain.FreeClassroom, error) {
	fields := map[string]string{"xnm": query.XNM, "xqm": query.XQM, "jyfs": "0"}
	if len(query.Weeks) > 0 {
		fields["zcd"] = weekMask(query.Weeks)
	}
	if len(query.Weekdays) > 0 {
		fields["xqj"] = weekdayList(query.Weekdays)
	}
	if len(query.Sections) > 0 {
		fields["jcd"] = sectionMask(query.Sections)
	}
	items := make([]domain.FreeClassroom, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, "/cdjy/cdjy_cxKxcdlb.html", "N2155", fields)
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapFreeClassroom(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func weekMask(weeks []int) string {
	var mask int64
	for _, week := range weeks {
		if week > 0 && week < 63 {
			mask += int64(1) << (week - 1)
		}
	}
	return strconv.FormatInt(mask, 10)
}

func sectionMask(sections []int) string {
	var mask int64
	for _, section := range sections {
		if section > 0 && section < 63 {
			mask += int64(1) << (section - 1)
		}
	}
	return strconv.FormatInt(mask, 10)
}

func weekdayList(weekdays []int) string {
	seen := map[int]bool{}
	for _, day := range weekdays {
		seen[day] = true
	}
	values := make([]int, 0, len(seen))
	for day := range seen {
		values = append(values, day)
	}
	sort.Ints(values)
	parts := make([]string, 0, len(values))
	for _, day := range values {
		parts = append(parts, strconv.Itoa(day))
	}
	return strings.Join(parts, ",")
}
