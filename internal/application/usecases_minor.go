package application

import (
	"context"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

type MinorKind struct {
	Code domain.MinorProgramKind
	Name string
}

var minorKinds = []MinorKind{
	{Code: domain.MinorMicroMajor, Name: "微专业"},
	{Code: domain.MinorDualDegree, Name: "二学位"},
	{Code: domain.MinorMinor, Name: "辅修"},
}

func ResolveMinorKind(value string) (MinorKind, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return minorKinds[0], nil
	}
	aliases := map[string]domain.MinorProgramKind{
		"02": domain.MinorMicroMajor, "03": domain.MinorDualDegree, "04": domain.MinorMinor,
	}
	if code, ok := aliases[text]; ok {
		for _, kind := range minorKinds {
			if kind.Code == code {
				return kind, nil
			}
		}
	}
	for _, kind := range minorKinds {
		if kind.Name == text || strings.Contains(kind.Name, text) {
			return kind, nil
		}
	}
	return MinorKind{}, domain.ConfigError("未支持的类型：%s。可选：微专业 / 二学位 / 辅修", value)
}

type MinorScheduleQueryInput struct {
	Term    domain.Term
	Kind    string
	College string
	Grade   string
	Major   string
}

type MinorScheduleView struct {
	Kind    MinorKind
	Entries []domain.MinorScheduleEntry
	Scope   CascadeSelection
	Scoped  bool
}

func ReadMinorSchedules(
	ctx context.Context,
	gateway MinorScheduleGateway,
	query MinorScheduleQueryInput,
) (MinorScheduleView, error) {
	kind, err := ResolveMinorKind(query.Kind)
	if err != nil {
		return MinorScheduleView{}, err
	}
	options := domain.CascadeOptions{}
	needsOptions := query.College != "" || query.Grade != "" || query.Major != ""
	if needsOptions {
		options, err = gateway.GetMinorScheduleOptions(ctx, kind.Code)
		if err != nil {
			return MinorScheduleView{}, err
		}
	}
	scope, err := SelectCascade(options, CascadeInput{
		College: query.College, Grade: query.Grade, Major: query.Major,
	})
	if err != nil {
		return MinorScheduleView{}, err
	}
	remote := domain.MinorScheduleQuery{
		XNM: query.Term.AcademicYear, XQM: query.Term.Semester, Kind: kind.Code,
	}
	if scope.College != nil {
		remote.CollegeID = scope.College.Value
	}
	if scope.Grade != nil {
		remote.GradeID = scope.Grade.Value
	}
	if scope.Major != nil {
		remote.MajorID = scope.Major.Value
	}
	entries, err := gateway.QueryMinorSchedules(ctx, remote)
	if err != nil {
		return MinorScheduleView{}, err
	}
	if entries == nil {
		entries = make([]domain.MinorScheduleEntry, 0)
	}
	return MinorScheduleView{
		Kind: kind, Entries: entries, Scope: scope,
		Scoped: scope.College != nil || scope.Grade != nil || scope.Major != nil,
	}, nil
}
