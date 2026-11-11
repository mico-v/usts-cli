package application

import (
	"context"
	"fmt"

	"github.com/mico-v/usts-cli/internal/domain"
)

const DefaultAcademiaPDFName = "transcript.pdf"

type DocumentStore interface {
	Exists(path string) bool
	Write(path string, data []byte) (string, error)
}

func DefaultSchedulePDFName(xnm, xqm string) string {
	if xqm == "" {
		xqm = "all"
	}
	return fmt.Sprintf("schedule-%s-%s.pdf", xnm, xqm)
}

func SaveSchedulePDF(
	ctx context.Context,
	gateway ScheduleDocumentGateway,
	store DocumentStore,
	xnm, xqm, output string,
	force bool,
) (string, error) {
	if output == "" {
		output = DefaultSchedulePDFName(xnm, xqm)
	}
	if !force && store.Exists(output) {
		return "", domain.NewError(domain.CodeFileSystem, fmt.Sprintf("目标文件已存在：%s（默认不覆盖已有文件）", output))
	}
	bytes, err := gateway.DownloadSchedulePDF(ctx, xnm, xqm, "导出")
	if err != nil {
		return "", err
	}
	return store.Write(output, bytes)
}

func SaveAcademiaPDF(
	ctx context.Context,
	gateway AcademiaDocumentGateway,
	store DocumentStore,
	output string,
	force bool,
) (string, error) {
	if output == "" {
		output = DefaultAcademiaPDFName
	}
	if !force && store.Exists(output) {
		return "", domain.NewError(domain.CodeFileSystem, fmt.Sprintf("目标文件已存在：%s（默认不覆盖已有文件）", output))
	}
	bytes, err := gateway.DownloadAcademiaPDF(ctx)
	if err != nil {
		return "", err
	}
	return store.Write(output, bytes)
}
