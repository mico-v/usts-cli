package jwgl

import (
	"context"
	"net/http"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	planPath       = "/jxzxjhgl/jxzxjhck_cxJxzxjhckIndex.html"
	planCoursePath = "/jxzxjhgl/jxzxjhkcxx_cxJxzxjhkcxxIndex.html"
)

func (c *Client) GetPlanOptions(ctx context.Context) (domain.CascadeOptions, error) {
	var options domain.CascadeOptions
	path := planPath + "?gnmkdm=N153540"
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: path, Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + planPath}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "执行计划选单解析"); err != nil {
			return err
		}
		options = ParseCascadeOptions(string(response.Body), "jg_id", "nj_cx", "zyh_id_cx")
		if len(options.Colleges) == 0 && len(options.Grades) == 0 && len(options.Majors) == 0 {
			return AmbiguousRejection("执行计划选单解析", string(response.Body))
		}
		return nil
	})
	return options, err
}

func (c *Client) QueryPlan(ctx context.Context, filter domain.PlanFilter) ([]domain.PlanEntry, error) {
	items := make([]domain.PlanEntry, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, planPath, "N153540", map[string]string{
			"jg_id": filter.CollegeID, "njdm_id": filter.GradeID, "zyh_id": filter.MajorID,
		})
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapPlanEntry(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (c *Client) QueryPlanCourses(ctx context.Context, planID, courseCode string) ([]domain.PlanCourse, error) {
	if planID == "" {
		return []domain.PlanCourse{}, nil
	}
	items := make([]domain.PlanCourse, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, planCoursePath, "N153540", map[string]string{
			"jxzxjhxx_id": planID, "kch": courseCode,
			"jyxdxnm": "", "jyxdxqm": "", "yxxdxnm": "", "yxxdxqm": "", "shzt": "", "xdlx": "",
		})
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapPlanCourse(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}
