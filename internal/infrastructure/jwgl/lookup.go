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

type lookupSpec struct {
	Path      string
	Query     map[string]string
	IDKeys    []string
	LabelKeys []string
}

var lookupSpecs = map[string]lookupSpec{
	"teaching-units": {
		Path: "/xtgl/comm_cxKkbmList.html", Query: map[string]string{"rangeable": "false"},
		IDKeys: []string{"jg_id", "jgdm"}, LabelKeys: []string{"jgmc", "jgjc", "kkxy"},
	},
	"grades": {
		Path:   "/xtgl/comm_cxNjPaged.html",
		IDKeys: []string{"njdm_id", "njdm"}, LabelKeys: []string{"njmc"},
	},
	"colleges": {
		Path: "/xtgl/comm_cxXydmPaged.html", Query: map[string]string{"localeKey": "zh_CN"},
		IDKeys: []string{"xydm_id", "jg_id", "xydm"}, LabelKeys: []string{"xymc", "jgmc"},
	},
	"majors": {
		Path: "/xtgl/comm_cxZydmPaged.html", Query: map[string]string{"localeKey": "zh_CN"},
		IDKeys: []string{"zyh_id", "zydm", "zyh"}, LabelKeys: []string{"zymc"},
	},
	"classes": {
		Path: "/xtgl/comm_cxBjdmPaged.html", Query: map[string]string{"localeKey": "zh_CN"},
		IDKeys: []string{"bh_id", "bh"}, LabelKeys: []string{"bj", "bjmc"},
	},
	"campuses": {
		Path: "/query/query_cxXqList.html", Query: map[string]string{"sfky": "1"},
		IDKeys: []string{"xqh_id", "xqdm"}, LabelKeys: []string{"xqmc"},
	},
	"course-categories": {
		Path:   "/xkgl/common_queryKclbListPaged.html",
		IDKeys: []string{"kclbdm", "kclb_id"}, LabelKeys: []string{"kclbmc"},
	},
	"course-natures": {
		Path:   "/xkgl/common_queryKcxzPaged.html",
		IDKeys: []string{"dm", "kcxzdm", "kcxz_id"}, LabelKeys: []string{"mc", "kcxzmc"},
	},
	"course-ownerships": {
		Path:   "/xkgl/common_queryKcgsPaged.html",
		IDKeys: []string{"kcgsdm", "kcgs_id"}, LabelKeys: []string{"kcgsmc"},
	},
	"teaching-methods": {
		Path: "/xtgl/comm_cxJcsjList.html", Query: map[string]string{"lxdm": "0032"},
		IDKeys: []string{"dm", "jcsjdm", "id"}, LabelKeys: []string{"mc", "jcsjmc"},
	},
	"class-times": {
		Path: "/xtgl/comm_cxJcsjList.html", Query: map[string]string{"lxdm": "0036"},
		IDKeys: []string{"dm", "jcsjdm", "id"}, LabelKeys: []string{"mc", "jcsjmc"},
	},
	"sections": {
		Path:   "/xkgl/common_querySkjcList.html",
		IDKeys: []string{"dm"}, LabelKeys: []string{"dm"},
	},
}

func LookupKinds() []string {
	return []string{
		"teaching-units", "grades", "colleges", "majors", "classes", "campuses",
		"course-categories", "course-natures", "course-ownerships",
		"teaching-methods", "class-times", "sections",
	}
}

func (c *Client) QueryLookup(ctx context.Context, kind string) (domain.TableResult, error) {
	spec, ok := lookupSpecs[kind]
	if !ok {
		return domain.TableResult{}, domain.ConfigError("未知字典类型：%s", kind)
	}
	query := url.Values{
		"_search":                {"false"},
		"nd":                     {strconv.FormatInt(time.Now().UnixMilli(), 10)},
		"page":                   {"1"},
		"rows":                   {"100"},
		"sidx":                   {""},
		"sord":                   {"asc"},
		"queryModel.showCount":   {"5000"},
		"queryModel.currentPage": {"1"},
	}
	for key, value := range spec.Query {
		query.Set(key, value)
	}
	result := domain.TableResult{
		Section: kind, Headers: []string{"ID", "名称"}, Rows: make([][]string, 0),
	}
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet,
			Target: spec.Path + "?" + query.Encode(),
			Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + spec.Path}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "公共字典查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return AmbiguousRejection("公共字典查询", err)
		}
		records, ok := arrayOrItems(data)
		if !ok {
			return AmbiguousRejection("公共字典查询", data)
		}
		for _, record := range records {
			id := StringValue(record, spec.IDKeys...)
			label := StringValue(record, spec.LabelKeys...)
			if id == "" && label == "" {
				continue
			}
			result.Rows = append(result.Rows, []string{id, label})
		}
		return nil
	})
	return result, err
}
