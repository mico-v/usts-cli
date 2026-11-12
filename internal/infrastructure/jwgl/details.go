package jwgl

import (
	"context"
	"net/http"
	"net/url"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func (c *Client) QueryScoreDetail(
	ctx context.Context,
	xnm, xqm, jxbID, courseName string,
) (domain.HTMLDetail, error) {
	profile, err := c.QueryRichProfile(ctx)
	if err != nil {
		return domain.HTMLDetail{}, err
	}
	if profile.InternalID == "" {
		return domain.HTMLDetail{}, domain.NewError(domain.CodeProtocolChanged, "学生信息缺少内部 xh_id，无法查询成绩分项")
	}
	var detail domain.HTMLDetail
	err = c.withReauth(ctx, httpclient.EffectRead, func() error {
		query := url.Values{
			"jxb_id": {jxbID}, "xnm": {xnm}, "xqm": {xqm},
			"xh_id": {profile.InternalID}, "kcmc": {courseName}, "gnmkdm": {"N305005"},
		}
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet,
			Target: "/cjcx/cjcx_cxCjxqGjh.html?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + "/cjcx/cjcx_cxDgXscj.html"}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "成绩分项查询"); err != nil {
			return err
		}
		detail = ParseHTMLDetail(string(response.Body))
		if len(detail.Tables) == 0 && len(detail.Text) == 0 {
			return AmbiguousRejection("成绩分项查询", string(response.Body))
		}
		return nil
	})
	return detail, err
}

func (c *Client) QueryScoreTemplates(ctx context.Context, xnm, xqm string) ([]string, error) {
	templates := make([]string, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		query := url.Values{"gnmkdm": {"N305005"}, "xnm": {xnm}, "xqm": {xqm}}
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet,
			Target: "/cjcx/cjcx_cxXmblbzlist.html?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + "/cjcx/cjcx_cxDgXscj.html"}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "成绩分项模板查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("成绩分项模板查询", err)
		}
		values, ok := data.([]any)
		if !ok {
			return AmbiguousRejection("成绩分项模板查询", data)
		}
		for _, value := range values {
			text, ok := value.(string)
			if !ok {
				return AmbiguousRejection("成绩分项模板查询", data)
			}
			templates = append(templates, text)
		}
		return nil
	})
	return templates, err
}

func (c *Client) QueryCourseInfo(ctx context.Context, courseCode string) (domain.HTMLDetail, error) {
	var detail domain.HTMLDetail
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		query := url.Values{"id": {courseCode}}
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet,
			Target: "/jxjhgl/common_cxKcJbxx.html?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + "/jxjhgl/common_cxKcJbxx.html"}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "课程基本信息查询"); err != nil {
			return err
		}
		detail = ParseHTMLDetail(string(response.Body))
		if len(detail.Tables) == 0 && len(detail.Text) == 0 {
			return AmbiguousRejection("课程基本信息查询", string(response.Body))
		}
		return nil
	})
	return detail, err
}

func (c *Client) QueryUnplannedExams(
	ctx context.Context,
	xnm, xqm string,
) ([]domain.UnplannedExamItem, error) {
	items := make([]domain.UnplannedExamItem, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, "/kwgl/kscx_cxWpkskcList.html", "N358105", map[string]string{
			"xnm": xnm, "xqm": xqm,
		})
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapUnplannedExamItem(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (c *Client) QueryGraduationDesign(ctx context.Context, xnm, xqm string) (domain.TableResult, error) {
	headers := []string{
		"学年", "学期", "题目名称", "毕设类型", "学号", "姓名",
		"学院", "年级", "专业", "百分制总评成绩", "五级制总评成绩", "合成状态",
	}
	columns := []string{
		"xn_mc", "xq_mc", "ktmc", "bslx_mc", "xs_xh", "xs_xm",
		"xs_jg_mc", "xs_nj_mc", "xs_zy_mc", "cj", "wjzmc", "cjhcztmc",
	}
	result := domain.TableResult{Section: "bysj", Headers: headers, Rows: make([][]string, 0)}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, "/xsbysjgl/cjck_cxCjckIndex.html", "N532560", map[string]string{
			"xnm": xnm, "xqm": xqm,
		})
		if err != nil {
			return err
		}
		for _, record := range records {
			row := make([]string, len(columns))
			for index, column := range columns {
				row[index] = StringValue(record, column)
			}
			result.Rows = append(result.Rows, row)
		}
		return nil
	})
	return result, err
}
