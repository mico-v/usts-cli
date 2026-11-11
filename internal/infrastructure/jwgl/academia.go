package jwgl

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

var (
	academiaPageMarker  = regexp.MustCompile(`(?i)\$\.i18n\.get\('yqxf'\)|id=["']xh_id["']`)
	fontValuePattern    = regexp.MustCompile(`(?is)<font[^>]*size=["']?2px["']?[^>]*>(.*?)</font>`)
	categoryNodePattern = regexp.MustCompile(
		`(?s)"([^"]+?)&nbsp;"\s*\+\s*\$\.i18n\.get\('yqxf'\).*?":([0-9.]+)&nbsp;"\s*\+\s*\$\.i18n\.get\('hdxf'\).*?":([0-9.]+)&nbsp;&nbsp;"\s*\+\s*\$\.i18n\.get\('whdxf'\).*?":([0-9.]+)&nbsp;"\s*\+\s*"<span id='showKc([^']*)'>`,
	)
	studentIDPattern = regexp.MustCompile(`(?i)id=["']xh_id["'][^>]*value=["']([^"']+)["']`)
)

func (c *Client) fetchAcademiaPage(ctx context.Context) (string, error) {
	path := "/xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515&layout=default"
	response, err := c.transport.Do(ctx, httpclient.Request{
		Method: http.MethodGet, Target: path, Effect: httpclient.EffectRead,
		Header: http.Header{"Referer": []string{c.transport.BaseURL() + "/xtgl/index_initMenu.html"}},
	})
	if err != nil {
		return "", err
	}
	if err := AssertReadableResponse(response, "学业情况查询"); err != nil {
		return "", err
	}
	return string(response.Body), nil
}

func (c *Client) QueryGpa(ctx context.Context) (domain.GpaSummary, error) {
	var summary domain.GpaSummary
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		page, err := c.fetchAcademiaPage(ctx)
		if err != nil {
			return err
		}
		summary, err = parseGpaSummary(page)
		return err
	})
	return summary, err
}

func (c *Client) QueryAcademia(ctx context.Context) (domain.AcademiaSummary, error) {
	var summary domain.AcademiaSummary
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		page, err := c.fetchAcademiaPage(ctx)
		if err != nil {
			return err
		}
		c.mu.Lock()
		studentID := c.username
		c.mu.Unlock()
		summary, err = parseAcademiaSummary(page, studentID)
		return err
	})
	return summary, err
}

func (c *Client) QueryAcademiaCategory(ctx context.Context, categoryID string) ([]domain.AcademiaCourseItem, error) {
	if categoryID == "" {
		return []domain.AcademiaCourseItem{}, nil
	}
	items := make([]domain.AcademiaCourseItem, 0)
	path := "/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515"
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(ctx, path, url.Values{"xfyqjd_id": {categoryID}},
			c.transport.BaseURL()+"/xsxy/xsxyqk_cxXsxyqkIndex.html", httpclient.EffectRead)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "学业分类查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("学业分类查询", err)
		}
		records, ok := data.([]any)
		if !ok {
			return AmbiguousRejection("学业分类查询", data)
		}
		for _, record := range RecordArray(records) {
			item, err := mapAcademiaCourseItem(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func parseGpaSummary(source string) (domain.GpaSummary, error) {
	if !academiaPageMarker.MatchString(source) {
		return domain.GpaSummary{}, &domain.AppError{
			Code: domain.CodeProtocolChanged, Ambiguous: true,
			Message: "GPA 页面结构不符：未找到学分分类模板或学号锚点",
		}
	}
	visible := CleanHTML(source)
	texts := ExtractVisibleText(source)
	var fontValues []float64
	for _, match := range fontValuePattern.FindAllStringSubmatch(source, -1) {
		if len(match) == 2 {
			if value, ok := numberFromText(CleanHTML(match[1])); ok {
				fontValues = append(fontValues, value)
			}
		}
	}
	number := func(patterns ...*regexp.Regexp) *float64 {
		for _, pattern := range patterns {
			if value, ok := numberFromText(MatchText(visible, pattern)); ok {
				return &value
			}
		}
		return nil
	}
	gpa := number(
		regexp.MustCompile(`(?i)(?:平均绩点|GPA)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)`),
	)
	if gpa == nil && len(fontValues) > 2 {
		value := fontValues[2]
		gpa = &value
	}
	return domain.GpaSummary{
		GPA:           gpa,
		AverageScore:  number(regexp.MustCompile(`(?:平均分|平均成绩)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)`)),
		TotalCredits:  number(regexp.MustCompile(`(?:总学分|计划学分)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)`)),
		EarnedCredits: number(regexp.MustCompile(`(?:获得学分|已修学分|修得学分)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)`)),
		RawText:       texts,
	}, nil
}

func parseAcademiaSummary(source, fallbackStudentID string) (domain.AcademiaSummary, error) {
	if !academiaPageMarker.MatchString(source) {
		return domain.AcademiaSummary{}, &domain.AppError{
			Code: domain.CodeProtocolChanged, Ambiguous: true,
			Message: "学业情况页面结构不符：未找到学分分类模板或学号锚点",
		}
	}
	texts := ExtractVisibleText(source)
	studentID := MatchText(source, studentIDPattern)
	if studentID == "" {
		studentID = fallbackStudentID
	}
	categories := make([]domain.AcademiaCategory, 0)
	for _, match := range categoryNodePattern.FindAllStringSubmatch(source, -1) {
		name := strings.TrimSpace(match[1])
		if name == "" || strings.ContainsAny(name, "$") || strings.Contains(name, ".i18n") {
			continue
		}
		required, _ := numberFromText(match[2])
		earned, _ := numberFromText(match[3])
		missing, _ := numberFromText(match[4])
		id := match[5]
		category := domain.AcademiaCategory{
			Name: name, RequiredCredits: &required, EarnedCredits: &earned,
			MissingCredits: &missing, DetailAvailable: id != "",
		}
		if id != "" {
			category.ID = &id
		}
		categories = append(categories, category)
	}
	summaryText := strings.Join(texts, " ")
	stat := func(pattern string) *int {
		value, ok := numberFromText(MatchText(summaryText, regexp.MustCompile(pattern)))
		if !ok {
			return nil
		}
		integer := int(value)
		return &integer
	}
	summary := domain.AcademiaSummary{
		GPA:                    optionalFloat(MatchText(summaryText, regexp.MustCompile(`(?i)(?:平均学分绩点（GPA）|平均绩点|GPA)[^0-9]*([0-9]+(?:\.[0-9]+)?)`))),
		PlannedCourses:         stat(`计划总课程\s*(\d+)\s*门`),
		PassedCourses:          stat(`计划总课程\s*\d+\s*门\s*通过\s*(\d+)\s*门`),
		FailedCourses:          stat(`未通过\s*(\d+)\s*门`),
		UnlearnedCourses:       stat(`未修\s*(\d+)\s*门`),
		InProgressCourses:      stat(`在读\s*(\d+)\s*门`),
		UnplannedPassedCourses: stat(`计划外：\s*通过\s*(\d+)\s*门`),
		UnplannedFailedCourses: stat(`计划外：\s*通过\s*\d+\s*门，?\s*未通过\s*(\d+)\s*门`),
		Categories:             categories,
		RawText:                texts,
	}
	if studentID != "" {
		summary.StudentID = &studentID
	}
	return summary, nil
}

func numberFromText(value string) (float64, bool) {
	if value == "" {
		return 0, false
	}
	match := numberPattern.FindString(value)
	if match == "" {
		return 0, false
	}
	number, err := strconv.ParseFloat(match, 64)
	return number, err == nil
}

func optionalFloat(value string) *float64 {
	number, ok := numberFromText(value)
	if !ok {
		return nil
	}
	return &number
}
