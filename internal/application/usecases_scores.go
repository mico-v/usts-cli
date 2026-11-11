package application

import (
	"context"

	"github.com/mico-v/usts-cli/internal/domain"
)

type ScoresQuery struct {
	XNM    string
	XQM    string
	KCXZDM string
}

type ScoresView struct {
	Items       []domain.ScoreItem
	TotalCredit float64
}

func ReadScores(ctx context.Context, gateway ScoresGateway, query ScoresQuery) (ScoresView, error) {
	extra := map[string]string{}
	if query.KCXZDM != "" {
		extra["kcxzdm"] = query.KCXZDM
	}
	items, err := gateway.QueryScores(ctx, query.XNM, query.XQM, extra)
	if err != nil {
		return ScoresView{}, err
	}
	if items == nil {
		items = make([]domain.ScoreItem, 0)
	}
	var total float64
	for _, item := range items {
		if item.Credit != nil {
			total += *item.Credit
		}
	}
	return ScoresView{Items: items, TotalCredit: total}, nil
}
