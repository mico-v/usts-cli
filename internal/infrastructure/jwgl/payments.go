package jwgl

import (
	"context"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func (c *Client) QueryPayments(ctx context.Context, xnm, xqm string) ([]domain.PaymentItem, error) {
	items := make([]domain.PaymentItem, 0)
	err := c.withReauth(ctx, httpclient.EffectRead, func() error {
		records, err := PostGrid(ctx, c.transport, "/paycenter/paycenter_cxGrjfIndex.html", "N0185", map[string]string{
			"xnm": xnm, "xqm": xqm,
		})
		if err != nil {
			return err
		}
		for _, record := range records {
			item, err := mapPaymentItem(record)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}
