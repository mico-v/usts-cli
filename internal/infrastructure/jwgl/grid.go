package jwgl

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	gridPageSize = 5000
	maxGridPages = 20
)

func PostGrid(
	ctx context.Context,
	transport *httpclient.Transport,
	dataPath, gnmkdm string,
	extra map[string]string,
) ([]RawRecord, error) {
	var all []RawRecord
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
		target := fmt.Sprintf("%s?doType=query&gnmkdm=%s", dataPath, url.QueryEscape(gnmkdm))
		response, err := transport.Do(ctx, httpclient.Request{
			Method: http.MethodPost,
			Target: target,
			Body:   []byte(form.Encode()),
			Header: transport.FormHeaders(transport.BaseURL() + dataPath),
			Effect: httpclient.EffectRead,
		})
		if err != nil {
			return nil, err
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
		items := RecordArray(envelope["items"])
		all = append(all, items...)
		total := numberFromAny(envelope["totalCount"])
		if total > 0 && len(all) >= total {
			break
		}
		if len(items) == 0 || len(items) < gridPageSize {
			break
		}
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
