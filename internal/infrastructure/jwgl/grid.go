package jwgl

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	gridPageSize   = 5000
	maxGridPages   = 20
	maxGridRecords = 100_000
	maxGridBytes   = 64 * 1024 * 1024
)

func PostGrid(
	ctx context.Context,
	transport *httpclient.Transport,
	dataPath, gnmkdm string,
	extra map[string]string,
) ([]RawRecord, error) {
	target := fmt.Sprintf("%s?doType=query&gnmkdm=%s", dataPath, url.QueryEscape(gnmkdm))
	return postGridTarget(ctx, transport, target, transport.BaseURL()+dataPath, extra)
}

func PostGridCustom(
	ctx context.Context,
	transport *httpclient.Transport,
	target, referer string,
	extra map[string]string,
) ([]RawRecord, error) {
	return postGridTarget(ctx, transport, target, referer, extra)
}

func postGridTarget(
	ctx context.Context,
	transport *httpclient.Transport,
	target, referer string,
	extra map[string]string,
) ([]RawRecord, error) {
	var all []RawRecord
	total := 0
	complete := false
	responseBytes := 0
	for page := 1; page <= maxGridPages; page++ {
		form := url.Values{}
		for key, value := range extra {
			form.Set(key, value)
		}
		form.Set("_search", "false")
		form.Set("nd", strconv.FormatInt(time.Now().UnixMilli(), 10))
		form.Set("page", strconv.Itoa(page))
		form.Set("rows", "100")
		form.Set("sidx", "")
		form.Set("sord", "asc")
		form.Set("queryModel.showCount", strconv.Itoa(gridPageSize))
		form.Set("queryModel.currentPage", strconv.Itoa(page))
		if _, exists := form["queryModel.sortName"]; !exists {
			form.Set("queryModel.sortName", "")
		}
		if _, exists := form["queryModel.sortOrder"]; !exists {
			form.Set("queryModel.sortOrder", "asc")
		}
		if _, exists := form["time"]; !exists {
			form.Set("time", "0")
		}
		response, err := transport.Do(ctx, httpclient.Request{
			Method: http.MethodPost,
			Target: target,
			Body:   []byte(form.Encode()),
			Header: transport.FormHeaders(referer),
			Effect: httpclient.EffectRead,
		})
		if err != nil {
			return nil, err
		}
		responseBytes += len(response.Body)
		if responseBytes > maxGridBytes {
			return nil, domain.NewError(domain.CodeProtocolChanged, "列表查询响应超过 64 MiB 上限")
		}
		if err := AssertReadableResponse(response, "列表查询"); err != nil {
			return nil, err
		}
		data, err := ParseJSON(response.Body)
		if err != nil {
			return nil, AmbiguousRejection("列表查询", err)
		}
		if err := AssertGridEnvelope(data, "列表查询"); err != nil {
			return nil, err
		}
		envelope := data.(map[string]any)
		items, err := RecordArrayStrict(envelope["items"])
		if err != nil {
			return nil, err
		}
		all = append(all, items...)
		total = numberFromAny(envelope["totalCount"])
		if total > maxGridRecords {
			return nil, domain.NewError(domain.CodeProtocolChanged, "列表查询结果超过 100000 条上限")
		}
		if total > 0 && len(all) >= total {
			complete = true
			break
		}
		if len(items) == 0 {
			if total > 0 && len(all) < total {
				return nil, domain.NewError(domain.CodeProtocolChanged, "列表查询提前结束：服务端声明的总数大于已返回数据")
			}
			complete = true
			break
		}
		if len(all) > maxGridRecords {
			return nil, domain.NewError(domain.CodeProtocolChanged, "列表查询结果超过 100000 条上限")
		}
		if total == 0 && len(items) < gridPageSize {
			complete = true
			break
		}
	}
	if !complete {
		return nil, domain.NewError(domain.CodeProtocolChanged, "列表查询超过最大分页数，拒绝返回可能被截断的数据")
	}
	return all, nil
}

func AssertGridEnvelope(data any, operation string) error {
	envelope, ok := data.(map[string]any)
	if !ok {
		return AmbiguousRejection(operation, data)
	}
	if _, ok := envelope["items"].([]any); !ok {
		return AmbiguousRejection(operation, data)
	}
	if _, ok := envelope["totalCount"]; !ok {
		return AmbiguousRejection(operation, data)
	}
	return nil
}

func numberFromAny(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	case string:
		number, _ := strconv.Atoi(typed)
		return number
	case interface{ String() string }:
		number, _ := strconv.Atoi(typed.String())
		return number
	default:
		return 0
	}
}
