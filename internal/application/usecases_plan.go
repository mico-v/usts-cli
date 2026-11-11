package application

import (
	"context"

	"github.com/mico-v/usts-cli/internal/domain"
)

type PlanQuery struct {
	All     bool
	College string
	Grade   string
	Major   string
	Course  *string
}

type PlanView struct {
	Entries    []domain.PlanEntry
	Courses    []domain.PlanCourse
	Scope      CascadeSelection
	CourseCode *string
}

func ReadPlan(ctx context.Context, gateway PlanGateway, query PlanQuery) (PlanView, error) {
	options := domain.CascadeOptions{}
	if !query.All {
		var err error
		options, err = gateway.GetPlanOptions(ctx)
		if err != nil {
			return PlanView{}, err
		}
	}
	scope, err := SelectCascade(options, CascadeInput{
		College: query.College, Grade: query.Grade, Major: query.Major, All: query.All,
	})
	if err != nil {
		return PlanView{}, err
	}
	filter := domain.PlanFilter{}
	if scope.College != nil {
		filter.CollegeID = scope.College.Value
	}
	if scope.Grade != nil {
		filter.GradeID = scope.Grade.Value
	}
	if scope.Major != nil {
		filter.MajorID = scope.Major.Value
	}
	entries, err := gateway.QueryPlan(ctx, filter)
	if err != nil {
		return PlanView{}, err
	}
	if entries == nil {
		entries = make([]domain.PlanEntry, 0)
	}
	view := PlanView{Entries: entries, Courses: make([]domain.PlanCourse, 0), Scope: scope}
	if query.Course == nil {
		return view, nil
	}
	if len(entries) != 1 {
		if len(entries) == 0 {
			return PlanView{}, domain.ConfigError("当前条件没有匹配的执行计划，无法查询课程明细")
		}
		return PlanView{}, domain.ConfigError("课程明细需要唯一一条执行计划，当前条件匹配到 %d 条。请缩小年级或专业范围", len(entries))
	}
	courseCode := *query.Course
	if entries[0].ID == nil {
		return PlanView{}, domain.NewError(domain.CodeProtocolChanged, "执行计划缺少课程明细 ID")
	}
	view.Courses, err = gateway.QueryPlanCourses(ctx, *entries[0].ID, courseCode)
	if err != nil {
		return PlanView{}, err
	}
	if view.Courses == nil {
		view.Courses = make([]domain.PlanCourse, 0)
	}
	view.CourseCode = &courseCode
	return view, nil
}
