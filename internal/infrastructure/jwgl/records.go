package jwgl

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func (c *Client) QueryScores(ctx context.Context, xnm, xqm string, extra map[string]string) ([]domain.ScoreItem, error) {
	var items []domain.ScoreItem
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		raw, err := PostGrid(ctx, c.transport, "/cjcx/cjcx_cxXsgrcj.html", "N305005", scoreFields(xnm, xqm, extra))
		if err != nil {
			return err
		}
		items, err = mapScores(raw)
		return err
	})
	if err == nil || !domain.IsCode(err, domain.CodeProtocolChanged) {
		return items, err
	}
	err = c.withReauth(ctx, httpclient.EffectRead, func() error {
		raw, err := PostGrid(ctx, c.transport, "/cjcx/cjcx_cxDgXscj.html", "N305005", scoreFields(xnm, xqm, extra))
		if err != nil {
			return err
		}
		items, err = mapScores(raw)
		return err
	})
	return items, err
}

func scoreFields(xnm, xqm string, extra map[string]string) map[string]string {
	fields := map[string]string{"xnm": xnm, "xqm": xqm}
	for key, value := range extra {
		fields[key] = value
	}
	return fields
}

func mapScores(records []RawRecord) ([]domain.ScoreItem, error) {
	items := make([]domain.ScoreItem, 0, len(records))
	for _, record := range records {
		item, err := mapScoreItem(record)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (c *Client) QueryExams(ctx context.Context, xnm, xqm string) ([]domain.ExamItem, error) {
	items := make([]domain.ExamItem, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, "/kwgl/kscx_cxXsksxxIndex.html", "N358105", map[string]string{"xnm": xnm, "xqm": xqm})
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapExamItem(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (c *Client) QueryCourseList(ctx context.Context, xnm, xqm string) ([]domain.CourseListItem, error) {
	items := make([]domain.CourseListItem, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, "/xkcx/xkmdcx_cxXkmdcxIndex.html", "N255010", map[string]string{"xnm": xnm, "xqm": xqm})
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapCourseListItem(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (c *Client) QuerySelectedCourses(ctx context.Context, xnm, xqm string) ([]domain.SelectedCourseItem, error) {
	items := make([]domain.SelectedCourseItem, 0)
	path := "/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html?gnmkdm=N253512"
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(ctx, path, url.Values{"xkxnm": {xnm}, "xkxqm": {xqm}},
			c.transport.BaseURL()+"/xsxk/zzxkyzb_cxZzxkYzbIndex.html", httpclient.EffectRead)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "已选课程查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("已选课程查询", err)
		}
		records, ok := arrayOrItems(data)
		if !ok {
			return AmbiguousRejection("已选课程查询", data)
		}
		for _, record := range records {
			item, err := mapSelectedCourseItem(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (c *Client) QueryNotifications(ctx context.Context) ([]domain.NotificationItem, error) {
	items := make([]domain.NotificationItem, 0)
	path := "/xtgl/index_cxDbsy.html?doType=query"
	form := url.Values{
		"sfyy": {"0"}, "flag": {"1"}, "_search": {"false"},
		"nd":                   {strconv.FormatInt(time.Now().UnixMilli(), 10)},
		"queryModel.showCount": {"1000"}, "queryModel.currentPage": {"1"},
		"queryModel.sortName": {"cjsj"}, "queryModel.sortOrder": {"desc"}, "time": {"0"},
	}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		headers := c.transport.FormHeaders(c.transport.BaseURL() + "/xtgl/index_initMenu.html")
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodPost, Target: path, Body: []byte(form.Encode()),
			Header: headers, Effect: httpclient.EffectRead,
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "通知查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("通知查询", err)
		}
		records, ok := arrayOrItems(data)
		if !ok {
			return AmbiguousRejection("通知查询", data)
		}
		for _, record := range records {
			item := domain.NotificationItem{
				Title:     OptionalString(record, "xxbt", "title", "bt"),
				Type:      OptionalString(record, "type", "lx"),
				Content:   OptionalString(record, "xxnr", "content"),
				CreatedAt: OptionalString(record, "cjsj", "createTime", "sj"),
			}
			if unread := BoolValue(record, "sfyy"); unread != nil {
				item.Unread = unread
			} else if raw, ok := record["isRead"]; ok {
				if read, ok := raw.(bool); ok {
					unread := !read
					item.Unread = &unread
				}
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (c *Client) QueryProfile(ctx context.Context) (domain.ProfileInfo, error) {
	var profile domain.ProfileInfo
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		c.mu.Lock()
		username := c.username
		c.mu.Unlock()
		query := url.Values{"gnmkdm": {"N100801"}}
		if username != "" {
			query.Set("su", username)
		}
		target := "/xsxxxggl/xsgrxxwh_cxXsgrxx.html?" + query.Encode()
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: target, Effect: httpclient.EffectRead,
			Header: http.Header{
				"Referer": []string{c.transport.BaseURL() + "/xtgl/index_initMenu.html"},
			},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "个人信息查询"); err != nil {
			return err
		}
		profile = ParseProfilePage(string(response.Body), username)
		if profile.DisplayName == "" && profile.College == "" && profile.ClassName == "" && profile.Major == "" {
			return AmbiguousRejection("个人信息查询", string(response.Body))
		}
		if username == "" && profile.StudentID != "" {
			c.mu.Lock()
			c.username = profile.StudentID
			c.mu.Unlock()
			_ = c.SaveSession()
		}
		return nil
	})
	return profile, err
}

func arrayOrItems(data any) ([]RawRecord, bool) {
	if records, ok := data.([]any); ok {
		return RecordArray(records), true
	}
	if object, ok := data.(map[string]any); ok {
		if items, exists := object["items"]; exists {
			if _, ok := items.([]any); ok {
				return RecordArray(items), true
			}
		}
	}
	return nil, false
}
