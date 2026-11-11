package application

import (
	"context"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

type AcademiaStat struct {
	Field string `json:"field"`
	Value int    `json:"value"`
}

type AcademiaOverview struct {
	Summary domain.AcademiaSummary
	Stats   []AcademiaStat
}

type AcademiaCategoryDetail struct {
	Category domain.AcademiaCategory
	Courses  []domain.AcademiaCourseItem
}

type AcademiaView struct {
	Overview *AcademiaOverview
	Category *AcademiaCategoryDetail
}

func MatchCategory(categories []domain.AcademiaCategory, keyword string) *domain.AcademiaCategory {
	keyword = strings.TrimSpace(keyword)
	for index := range categories {
		if strings.Contains(categories[index].Name, keyword) {
			return &categories[index]
		}
	}
	return nil
}

func ReadAcademia(ctx context.Context, gateway AcademiaGateway, categoryKeyword string) (AcademiaView, error) {
	summary, err := gateway.QueryAcademia(ctx)
	if err != nil {
		return AcademiaView{}, err
	}
	if categoryKeyword != "" {
		category := MatchCategory(summary.Categories, categoryKeyword)
		if category == nil || category.ID == nil || *category.ID == "" {
			names := make([]string, 0, len(summary.Categories))
			for _, item := range summary.Categories {
				names = append(names, item.Name)
			}
			return AcademiaView{}, domain.ConfigError("未找到匹配的分类「%s」。可用分类：\n  %s", strings.TrimSpace(categoryKeyword), strings.Join(names, "\n  "))
		}
		courses, err := gateway.QueryAcademiaCategory(ctx, *category.ID)
		if err != nil {
			return AcademiaView{}, err
		}
		if courses == nil {
			courses = make([]domain.AcademiaCourseItem, 0)
		}
		return AcademiaView{Category: &AcademiaCategoryDetail{Category: *category, Courses: courses}}, nil
	}
	if summary.Categories == nil {
		summary.Categories = make([]domain.AcademiaCategory, 0)
	}
	if summary.RawText == nil {
		summary.RawText = make([]string, 0)
	}
	stats := academiaStats(summary)
	return AcademiaView{Overview: &AcademiaOverview{Summary: summary, Stats: stats}}, nil
}

func academiaStats(summary domain.AcademiaSummary) []AcademiaStat {
	fields := []struct {
		name  string
		value *int
	}{
		{"plannedCourses", summary.PlannedCourses},
		{"passedCourses", summary.PassedCourses},
		{"failedCourses", summary.FailedCourses},
		{"unlearnedCourses", summary.UnlearnedCourses},
		{"inProgressCourses", summary.InProgressCourses},
		{"unplannedPassedCourses", summary.UnplannedPassedCourses},
		{"unplannedFailedCourses", summary.UnplannedFailedCourses},
	}
	var stats []AcademiaStat
	for _, field := range fields {
		if field.value != nil {
			stats = append(stats, AcademiaStat{Field: field.name, Value: *field.value})
		}
	}
	return stats
}
