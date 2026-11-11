package jwgl

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func (c *Client) QuerySchedule(ctx context.Context, xnm, xqm string) ([]domain.ScheduleItem, error) {
	items := make([]domain.ScheduleItem, 0)
	path := "/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151"
	form := url.Values{
		"xnm": {xnm}, "xqm": {xqm}, "kzlx": {"ck"},
		"xsdm": {""}, "kclbdm": {""}, "kclxdm": {""},
	}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(ctx, path, form,
			c.transport.BaseURL()+"/kbcx/xskbcx_cxXskbcxIndex.html", httpclient.EffectRead)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "课表查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("课表查询", err)
		}
		object, ok := data.(map[string]any)
		if !ok {
			return AmbiguousRejection("课表查询", data)
		}
		kbList, hasKB := object["kbList"].([]any)
		sjkList, hasSJK := object["sjkList"].([]any)
		if !hasKB && !hasSJK {
			return AmbiguousRejection("课表查询", data)
		}
		seen := map[string]bool{}
		appendItems := func(rawItems []any) error {
			for _, raw := range RecordArray(rawItems) {
				key := strings.Join([]string{
					StringValue(raw, "kcmc"), StringValue(raw, "jxb_id"), StringValue(raw, "jxbzh"),
					StringValue(raw, "xqj"), StringValue(raw, "jc"), StringValue(raw, "qsjsz"),
				}, "|")
				if key != "|||||" && seen[key] {
					continue
				}
				seen[key] = true
				item, err := mapScheduleItem(raw)
				if err != nil {
					return err
				}
				items = append(items, item)
			}
			return nil
		}
		if err := appendItems(kbList); err != nil {
			return err
		}
		if err := appendItems(sjkList); err != nil {
			return err
		}
		return nil
	})
	return items, err
}

func (c *Client) GetBjkbdyOptions(ctx context.Context) (domain.ClassScheduleView, error) {
	var options domain.ClassScheduleView
	path := "/kbdy/bjkbdy_cxBjkbdyIndex.html?gnmkdm=N214505"
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: path, Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + "/kbdy/bjkbdy_cxBjkbdyIndex.html"}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "班级课表选单解析"); err != nil {
			return err
		}
		options = ParseBjkbdyOptions(string(response.Body))
		if len(options.Colleges) == 0 {
			return AmbiguousRejection("班级课表选单解析", string(response.Body))
		}
		return nil
	})
	return options, err
}

func (c *Client) GetMajorsByCollege(ctx context.Context, collegeID string) ([]domain.SelectOption, error) {
	var options []domain.SelectOption
	query := url.Values{
		"jg_id": {collegeID}, "zyh_id_cx": {""},
		"_": {strconv.FormatInt(time.Now().UnixMilli(), 10)}, "gnmkdm": {"N214505"},
	}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: "/xtgl/comm_cxZydmList.html?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{
				"Referer":          []string{c.transport.BaseURL() + "/kbdy/bjkbdy_cxBjkbdyIndex.html"},
				"X-Requested-With": []string{"XMLHttpRequest"},
			},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "专业列表查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("专业列表查询", err)
		}
		records, ok := arrayOrItems(data)
		if !ok {
			return AmbiguousRejection("专业列表查询", data)
		}
		for _, record := range records {
			options = append(options, domain.SelectOption{
				Value: StringValue(record, "zyh_id"), Label: StringValue(record, "zymc"), Meta: map[string]any(record),
			})
		}
		return nil
	})
	return options, err
}

func (c *Client) GetClassesByMajor(
	ctx context.Context,
	collegeID, majorID, gradeID string,
) ([]domain.SelectOption, error) {
	var options []domain.SelectOption
	query := url.Values{
		"jg_id": {collegeID}, "zyh_id": {majorID}, "bh_id": {""}, "njdm_id": {gradeID},
		"_": {strconv.FormatInt(time.Now().UnixMilli(), 10)}, "gnmkdm": {"N214505"},
	}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: "/xtgl/comm_cxBjdmList.html?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{
				"Referer":          []string{c.transport.BaseURL() + "/kbdy/bjkbdy_cxBjkbdyIndex.html"},
				"X-Requested-With": []string{"XMLHttpRequest"},
			},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "班级列表查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("班级列表查询", err)
		}
		records, ok := arrayOrItems(data)
		if !ok {
			return AmbiguousRejection("班级列表查询", data)
		}
		for _, record := range records {
			options = append(options, domain.SelectOption{
				Value: StringValue(record, "bh_id"), Label: StringValue(record, "bj"), Meta: map[string]any(record),
			})
		}
		return nil
	})
	return options, err
}

func (c *Client) QueryClassSchedule(
	ctx context.Context,
	query domain.ClassScheduleQuery,
) ([]domain.ClassScheduleItem, []string, error) {
	items := make([]domain.ClassScheduleItem, 0)
	practice := make([]string, 0)
	path := "/kbdy/bjkbdy_cxBjKb.html?gnmkdm=N214505"
	form := buildClassScheduleBody(query)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(ctx, path, form,
			c.transport.BaseURL()+"/kbdy/bjkbdy_cxBjkbdyIndex.html", httpclient.EffectRead)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "班级课表查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("班级课表查询", err)
		}
		object, ok := data.(map[string]any)
		if !ok {
			return AmbiguousRejection("班级课表查询", data)
		}
		rawItems, ok := object["kbList"].([]any)
		if !ok {
			return AmbiguousRejection("班级课表查询", data)
		}
		for _, raw := range RecordArray(rawItems) {
			if room := StringValue(raw, "cdmc"); room == "" || room == "未排地点" {
				continue
			}
			item, err := mapClassScheduleItem(raw)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		if rawPractice, ok := object["sjkList"].([]any); ok {
			for _, raw := range RecordArray(rawPractice) {
				text := firstNonEmpty(StringValue(raw, "qtkcgs"), StringValue(raw, "sjkcgs"))
				if text != "" {
					practice = append(practice, text)
				}
			}
		}
		return nil
	})
	return items, practice, err
}

func buildClassScheduleBody(query domain.ClassScheduleQuery) url.Values {
	return url.Values{
		"xnm": {query.XNM}, "xqm": {query.XQM},
		"xnmc": {domain.AcademicYearName(query.XNM)}, "xqmmc": {domain.DisplaySemester(query.XQM)},
		"xqh_id": {query.CampusID}, "njdm_id": {query.GradeID}, "zyh_id": {query.MajorID}, "bh_id": {query.ClassID},
		"tjkbzdm": {"1"}, "tjkbzxsdm": {"0"},
		"zymc": {query.MajorName}, "jgmc": {query.CollegeName}, "njmc": {query.GradeName},
		"bj": {query.ClassName}, "bh": {query.ClassNumber},
		"jsxm": {""}, "lxdh": {""}, "zs": {""}, "zxszjjs": {"false"},
		"xsdm": {""}, "kclxdm": {""}, "kclbdm": {""}, "kbsjlyqz": {""}, "yf": {""}, "kzlx": {"ck"},
	}
}
