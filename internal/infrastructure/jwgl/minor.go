package jwgl

import (
	"context"
	"net/http"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	minorViewPath = "/kbdy2/fxzykbdy_cxFxzyKbdyIndex.html"
	minorListPath = "/kbdy2/fxzykbdy_cxFxzyKbdyTjkbList.html"
)

func minorKindCode(kind domain.MinorProgramKind) string {
	switch kind {
	case domain.MinorDualDegree:
		return "03"
	case domain.MinorMinor:
		return "04"
	default:
		return "02"
	}
}

func (c *Client) GetMinorScheduleOptions(
	ctx context.Context,
	kind domain.MinorProgramKind,
) (domain.CascadeOptions, error) {
	var options domain.CascadeOptions
	path := minorViewPath + "?kklxdm=" + minorKindCode(kind) + "&gnmkdm=N214556"
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: path, Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + path}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "微专业课表选单解析"); err != nil {
			return err
		}
		options = ParseCascadeOptions(string(response.Body), "jg_id", "njdm_id", "zyh_id")
		return nil
	})
	return options, err
}

func (c *Client) QueryMinorSchedules(
	ctx context.Context,
	query domain.MinorScheduleQuery,
) ([]domain.MinorScheduleEntry, error) {
	items := make([]domain.MinorScheduleEntry, 0)
	fields := map[string]string{
		"xnm": query.XNM, "xqm": query.XQM, "kklxdm": minorKindCode(query.Kind),
		"jg_id": query.CollegeID, "njdm_id": query.GradeID, "zyh_id": query.MajorID, "zs": "",
	}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, minorListPath, "N214556", fields)
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapMinorScheduleEntry(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}
