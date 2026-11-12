package jwgl

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	ProfileSectionPrimaryMajor    = "primary-major"
	ProfileSectionSecondaryMajor  = "secondary-major"
	ProfileSectionUnassignedMajor = "unassigned-major"
	ProfileSectionExamLevels      = "exam-levels"
	ProfileSectionFamily          = "family"
	ProfileSectionRecords         = "records"
	ProfileSectionAcademicYears   = "academic-years"
	ProfileSectionClasses         = "classes"
	ProfileSectionSelectedCourses = "selected-courses"
	ProfileSectionSelectionStatus = "selection-status"
)

type profileSectionSpec struct {
	Path         string
	Headers      []string
	Columns      []string
	GetJSONArray bool
}

var profileSections = map[string]profileSectionSpec{
	ProfileSectionPrimaryMajor: {
		Path:    "/xsxxxggl/xsxxwh_cxZxzyxx.html",
		Headers: []string{"毕业年份", "毕业日期", "毕业证书号", "结业证书号", "毕业结论", "学位类型", "发证时间"},
		Columns: []string{"bynf", "byrq", "byzsh", "jyzsh", "byjr", "xwlx", "byfzrq"},
	},
	ProfileSectionSecondaryMajor: {
		Path:    "/xsxxxggl/xsxxwh_cxFxzyxx.html",
		Headers: []string{"毕业年份", "毕业日期", "辅修专业毕业结论", "辅修学士学位毕业结论", "学位类型", "发证时间", "辅修专业名称"},
		Columns: []string{"bynf", "byrq", "fxjl", "fxxwjl", "fxxwlx", "fxfzrq", "fxzymc"},
	},
	ProfileSectionUnassignedMajor: {
		Path:    "/xsxxxggl/xsxxwh_cxWzyxx.html",
		Headers: []string{"毕业年份", "毕业日期", "毕业结论", "微专业名称"},
		Columns: []string{"bynf", "byrq", "fxjl", "fxzymc"},
	},
	ProfileSectionExamLevels: {
		Path:    "/xsxxxggl/xsxxwh_cxDjksxx.html",
		Headers: []string{"报名学年", "报名学期", "学号", "姓名", "项目类别", "项目名称", "项目成绩"},
		Columns: []string{"xnmmc", "xqmmc", "xh", "xm", "xmlbmc", "xmmc", "cj"},
	},
	ProfileSectionFamily: {
		Path:    "/xsxxxggl/xsxxwh_cxXsjtcy.html",
		Headers: []string{"姓名", "关系", "政治面貌", "出生年月", "工作单位", "职务", "单位电话", "通讯地址", "邮政编码", "电子邮箱", "手机号码"},
		Columns: []string{"jt_xm", "jt_gxmc", "jt_zzmmm", "jt_csny", "jt_gzdw", "jt_zw", "jt_lxdh", "jt_txdz", "jt_yzbm", "jt_dzyx", "jt_sjhm"},
	},
	ProfileSectionRecords: {
		Path:    "/xsxxxggl/xsxxwh_cxXsxxjl.html",
		Headers: []string{"开始年月", "结束年月", "学校/单位", "职务", "证明人", "证明人联系电话"},
		Columns: []string{"jl_ksny", "jl_jsny", "jl_xxdw", "jl_zw", "jl_zmr", "jl_zmrlxdh"},
	},
	ProfileSectionAcademicYears: {
		Path:    "/xsxxxggl/xsxxwh_cxXsxnjd.html",
		Headers: []string{"学年", "学生评价", "评价等级"},
		Columns: []string{"xnm", "xspj", "mc"},
	},
	ProfileSectionClasses: {
		Path:         "/xsxxxggl/xsxxwh_cxBjxxList.html",
		Headers:      []string{"班级编号", "班级"},
		Columns:      []string{"bh_id", "bj"},
		GetJSONArray: true,
	},
	ProfileSectionSelectedCourses: {
		Path:    "/xsxxxggl/xsxxwh_cxXsxkxx.html",
		Headers: []string{"学年", "学期", "课程", "开课学院", "课程类别", "课程归属", "学分", "教学班", "教师", "上课时间", "上课地点"},
		Columns: []string{"xnmc", "xqmmc", "kcmc", "kkxy", "kclbmc", "kcgsmc", "xf", "jxbmc", "jsxm", "sksj", "jxdd"},
	},
}

func ProfileSectionNames() []string {
	return []string{
		ProfileSectionPrimaryMajor,
		ProfileSectionSecondaryMajor,
		ProfileSectionUnassignedMajor,
		ProfileSectionExamLevels,
		ProfileSectionFamily,
		ProfileSectionRecords,
		ProfileSectionAcademicYears,
		ProfileSectionClasses,
		ProfileSectionSelectedCourses,
		ProfileSectionSelectionStatus,
	}
}

func (c *Client) QueryProfileSection(
	ctx context.Context,
	section, xnm, xqm string,
) (domain.TableResult, error) {
	if section == ProfileSectionSelectionStatus {
		return domain.TableResult{}, domain.ConfigError("selection-status 不是表格型个人信息分区")
	}
	spec, ok := profileSections[section]
	if !ok {
		return domain.TableResult{}, domain.ConfigError("未知个人信息分区：%s", section)
	}
	profile, err := c.QueryRichProfile(ctx)
	if err != nil {
		return domain.TableResult{}, err
	}
	if profile.InternalID == "" {
		return domain.TableResult{}, domain.NewError(domain.CodeProtocolChanged, "学生信息缺少内部 xh_id，无法查询子页签")
	}
	referer := c.transport.BaseURL() + "/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801"
	var records []RawRecord
	err = c.withReauth(ctx, httpclient.EffectRead, func() error {
		if spec.GetJSONArray {
			var err error
			records, err = c.getProfileArray(ctx, spec.Path, profile.InternalID, referer)
			return err
		}
		var err error
		records, err = c.getProfileGrid(ctx, spec.Path, profile.InternalID, referer)
		return err
	})
	if err != nil {
		return domain.TableResult{}, err
	}
	rows := make([][]string, 0, len(records))
	for _, record := range records {
		row := make([]string, len(spec.Columns))
		for index, column := range spec.Columns {
			row[index] = StringValue(record, column)
		}
		rows = append(rows, row)
	}
	return domain.TableResult{
		Section: section, Headers: append([]string(nil), spec.Headers...), Rows: rows,
	}, nil
}

func (c *Client) getProfileArray(
	ctx context.Context,
	endpoint, internalID, referer string,
) ([]RawRecord, error) {
	query := url.Values{
		"gnmkdm": {"N100801"}, "xh_id": {internalID}, "fromXh_id": {""},
	}
	response, err := c.transport.Do(ctx, httpclient.Request{
		Method: http.MethodGet,
		Target: endpoint + "?" + query.Encode(),
		Effect: httpclient.EffectRead,
		Header: http.Header{"Referer": []string{referer}},
	})
	if err != nil {
		return nil, err
	}
	if err := AssertReadableResponse(response, "个人信息分区查询"); err != nil {
		return nil, err
	}
	data, err := ParseJSON(response.Body)
	if err != nil {
		return nil, AmbiguousRejection("个人信息分区查询", err)
	}
	records, ok := arrayOrItems(data)
	if !ok {
		return nil, AmbiguousRejection("个人信息分区查询", data)
	}
	return records, nil
}

func (c *Client) getProfileGrid(
	ctx context.Context,
	endpoint, internalID, referer string,
) ([]RawRecord, error) {
	var all []RawRecord
	responseBytes := 0
	complete := false
	for page := 1; page <= maxGridPages; page++ {
		query := url.Values{
			"gnmkdm":                 {"N100801"},
			"xh_id":                  {internalID},
			"fromXh_id":              {""},
			"queryModel.showCount":   {strconv.Itoa(gridPageSize)},
			"queryModel.currentPage": {strconv.Itoa(page)},
		}
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet,
			Target: endpoint + "?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{referer}},
		})
		if err != nil {
			return nil, err
		}
		responseBytes += len(response.Body)
		if responseBytes > maxGridBytes {
			return nil, domain.NewError(domain.CodeProtocolChanged, "个人信息分区响应超过 64 MiB 上限")
		}
		data, parseErr := ParseJSON(response.Body)
		if response.StatusCode == 910 && parseErr == nil {
			records, total, ok := profileGridRecords(data)
			if ok && len(records) == 0 && total == 0 {
				complete = true
				break
			}
		}
		if err := AssertReadableResponse(response, "个人信息分区查询"); err != nil {
			return nil, err
		}
		if parseErr != nil {
			return nil, AmbiguousRejection("个人信息分区查询", parseErr)
		}
		records, total, ok := profileGridRecords(data)
		if !ok {
			return nil, AmbiguousRejection("个人信息分区查询", data)
		}
		all = append(all, records...)
		if total > maxGridRecords {
			return nil, domain.NewError(domain.CodeProtocolChanged, "个人信息分区结果超过 100000 条上限")
		}
		if total > 0 && len(all) >= total {
			complete = true
			break
		}
		if len(records) == 0 {
			if total > 0 && len(all) < total {
				return nil, domain.NewError(domain.CodeProtocolChanged, "个人信息分区查询提前结束：服务端声明的总数大于已返回数据")
			}
			complete = true
			break
		}
		if len(all) > maxGridRecords {
			return nil, domain.NewError(domain.CodeProtocolChanged, "个人信息分区结果超过 100000 条上限")
		}
		if total == 0 && len(records) < gridPageSize {
			complete = true
			break
		}
	}
	if !complete {
		return nil, domain.NewError(domain.CodeProtocolChanged, "个人信息分区查询超过最大分页数，拒绝返回可能被截断的数据")
	}
	return all, nil
}

func profileGridRecords(data any) ([]RawRecord, int, bool) {
	switch typed := data.(type) {
	case []any:
		records, err := RecordArrayStrict(typed)
		return records, len(records), err == nil
	case map[string]any:
		if items, exists := typed["items"]; exists {
			array, ok := items.([]any)
			if !ok {
				return nil, 0, false
			}
			records, err := RecordArrayStrict(array)
			if err != nil {
				return nil, 0, false
			}
			total := numberFromAny(typed["totalCount"])
			if _, exists := typed["totalCount"]; !exists {
				total = numberFromAny(typed["totalResult"])
			}
			return records, total, true
		}
		if totalResult, exists := typed["totalResult"]; exists && numberFromAny(totalResult) == 0 {
			if _, hasQueryModel := typed["queryModel"]; hasQueryModel {
				return []RawRecord{}, 0, true
			}
			if _, hasPageable := typed["pageable"]; hasPageable {
				return []RawRecord{}, 0, true
			}
		}
	}
	return nil, 0, false
}

func (c *Client) QuerySelectionStatus(ctx context.Context, xnm, xqm string) (domain.SelectionStatus, error) {
	var status domain.SelectionStatus
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(
			ctx,
			"/xsxxxggl/xsxxwh_cxViewKbzg.html?gnmkdm=N100801",
			url.Values{"xnm": {xnm}, "xqm": {xqm}, "fromXh_id": {""}},
			c.transport.BaseURL()+"/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801",
			httpclient.EffectRead,
		)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "选课状态查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("选课状态查询", err)
		}
		switch value := data.(type) {
		case string:
			status.Code = value
		case interface{ String() string }:
			status.Code = value.String()
		default:
			status.Code = fmt.Sprint(value)
		}
		if status.Code == "" || status.Code == "<nil>" {
			return AmbiguousRejection("选课状态查询", data)
		}
		return nil
	})
	return status, err
}
