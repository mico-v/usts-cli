package jwgl

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	SelectedViewBlocks     = "blocks"
	SelectedViewChosen     = "chosen"
	SelectedViewCredits    = "credits"
	SelectedViewEvaluation = "evaluation-status"
)

func (c *Client) QuerySelectedCourseView(
	ctx context.Context,
	kind, xnm, xqm, categoryCode, blockID string,
) (domain.HTMLDetail, error) {
	path := ""
	switch kind {
	case SelectedViewBlocks:
		path = "/xsxk/zzxkyzb_cxZzxkYzbDisplay.html?gnmkdm=N253512"
	case SelectedViewChosen:
		path = "/xsxk/zzxkyzb_cxZzxkYzbChoosed.html?gnmkdm=N253512"
	default:
		return domain.HTMLDetail{}, domain.ConfigError("未知已选课程视图：%s", kind)
	}
	var detail domain.HTMLDetail
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(
			ctx,
			path,
			url.Values{"kklxdm": {categoryCode}, "xkkz_id": {blockID}, "xnm": {xnm}, "xqm": {xqm}},
			c.transport.BaseURL()+"/xsxk/zzxkyzb_cxZzxkYzbIndex.html",
			httpclient.EffectRead,
		)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "已选课程视图查询"); err != nil {
			return err
		}
		detail = ParseHTMLDetail(string(response.Body))
		if len(detail.Tables) == 0 && len(detail.Text) == 0 {
			return AmbiguousRejection("已选课程视图查询", string(response.Body))
		}
		return nil
	})
	return detail, err
}

func (c *Client) QuerySelectedCourseScalar(
	ctx context.Context,
	kind, categoryCode, blockID string,
) (domain.ScalarValue, error) {
	path := ""
	switch kind {
	case SelectedViewCredits:
		path = "/xsxk/zzxkyzb_cxZzxkyzbLnyhxf.html?gnmkdm=N253512"
	case SelectedViewEvaluation:
		path = "/xsxk/zzxkyzb_cxTbXspjzt.html?gnmkdm=N253512"
	default:
		return domain.ScalarValue{}, domain.ConfigError("未知已选课程状态：%s", kind)
	}
	var value domain.ScalarValue
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.PostForm(
			ctx,
			path,
			url.Values{"kklxdm": {categoryCode}, "xkkz_id": {blockID}},
			c.transport.BaseURL()+"/xsxk/zzxkyzb_cxZzxkYzbIndex.html",
			httpclient.EffectRead,
		)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "已选课程状态查询"); err != nil {
			return err
		}
		data, err := ParseJSON(response.Body)
		if err == nil {
			switch typed := data.(type) {
			case string:
				value.Value = typed
			case interface{ String() string }:
				value.Value = typed.String()
			default:
				value.Value = fmt.Sprint(typed)
			}
		} else {
			value.Value = strings.TrimSpace(string(response.Body))
		}
		if value.Value == "" {
			return AmbiguousRejection("已选课程状态查询", string(response.Body))
		}
		return nil
	})
	return value, err
}
