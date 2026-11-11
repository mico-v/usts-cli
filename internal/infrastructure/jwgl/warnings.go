package jwgl

import (
	"context"
	"net/http"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func (c *Client) QueryWarning(ctx context.Context) (domain.WarningStatus, error) {
	var status domain.WarningStatus
	path := "/xyyjjk/xyyjclcx_cxXyyjclcxxsIndex.html?gnmkdm=N305516"
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		response, err := c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodGet, Target: path, Effect: httpclient.EffectRead,
			Header: http.Header{"Referer": []string{c.transport.BaseURL() + "/xyyjjk/xyyjclcx_cxXyyjclcxxsIndex.html"}},
		})
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(response, "学业预警查询"); err != nil {
			return err
		}
		status = ParseWarningPage(string(response.Body))
		if !status.HasWarning && len(status.Messages) == 0 {
			return AmbiguousRejection("学业预警查询", string(response.Body))
		}
		return nil
	})
	return status, err
}
