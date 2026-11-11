package jwgl

import (
	"context"
	"net/url"
	"regexp"
	"strings"

	"github.com/mico-v/usts-cli/internal/config"
	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	schedulePDFPolicyPath = "/kbdy/bjkbdy_cxXnxqsfkz.html"
	schedulePDFFilePath   = "/kbcx/xskbcx_cxXsShcPdf.html"
	academiaPDFListPath   = "/bysxxcx/xscjzbdy_dyList.html"
	academiaPDFProgress   = "/xtgl/progress_cxProgressStatus.html"
)

var pdfErrorPattern = regexp.MustCompile(`(?i)错误|error_title`)

func (c *Client) DownloadSchedulePDF(ctx context.Context, xnm, xqm, name string) ([]byte, error) {
	if name == "" {
		name = "导出"
	}
	var result []byte
	err := c.withReauth(ctx, httpclient.EffectDownload, func() error {
		body := buildSchedulePDFBody(xnm, xqm, name)
		policy, err := c.transport.PostForm(ctx, schedulePDFPolicyPath+"?gnmkdm=N2151", body,
			c.transport.BaseURL()+schedulePDFPolicyPath, httpclient.EffectDownload)
		if err != nil {
			return err
		}
		if err := AssertReadableResponse(policy, "课表 PDF 预检"); err != nil {
			return err
		}
		file, err := c.transport.PostForm(ctx, schedulePDFFilePath+"?doType=table", body,
			c.transport.BaseURL()+schedulePDFFilePath, httpclient.EffectDownload)
		if err != nil {
			return err
		}
		resolved, err := c.resolveFileResponse(ctx, file)
		if err != nil {
			return err
		}
		if err := AssertPDFResponse(resolved); err != nil {
			return err
		}
		result = resolved.Body
		return nil
	})
	return result, err
}

func (c *Client) DownloadAcademiaPDF(ctx context.Context) ([]byte, error) {
	var result []byte
	err := c.withReauth(ctx, httpclient.EffectDownload, func() error {
		steps := []struct {
			Path string
			Form url.Values
		}{
			{"/bysxxcx/xscjzbdy_dyXscjzbView.html", url.Values{"gnmkdm": {"N558020"}}},
			{"/bysxxcx/xscjzbdy_dyCjdyszxView.html", url.Values{"xh": {""}}},
			{"/xtgl/bysxxcx/xscjzbdy_cxXsCount.html", academiaPDFData()},
			{"/bysxxcx/xscjzbdy_cxGswjlx.html", academiaPDFData()},
			{"/common/common_cxJwxtxx.html", url.Values{"gnmkdm": {"N558020"}}},
		}
		for _, step := range steps {
			if _, err := c.postPDFStep(ctx, step.Path, step.Form); err != nil {
				return err
			}
		}
		fileResponse, err := c.postPDFStep(ctx, academiaPDFListPath, academiaPDFData())
		if err != nil {
			return err
		}
		fileText := string(fileResponse.Body)
		if pdfErrorPattern.MatchString(fileText) {
			return domain.NewError(domain.CodeRemoteServer, "成绩总表 PDF 生成失败")
		}
		pdfPath := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(fileText, "#成功", ""), `"`, ""))
		pdfPath = strings.ReplaceAll(pdfPath, `\`, "/")
		if pdfPath == "" {
			return domain.NewError(domain.CodeProtocolChanged, "成绩总表 PDF 未返回下载路径")
		}
		progress := academiaPDFData()
		progress.Set("key", "score_print_processed")
		if _, err := c.postPDFStep(ctx, academiaPDFProgress, progress); err != nil {
			return err
		}
		downloadURL, err := config.AssertSameOrigin(pdfPath, c.transport.BaseURL())
		if err != nil {
			return err
		}
		download, err := c.transport.GetFollowingSameOrigin(ctx, downloadURL, httpclient.EffectDownload)
		if err != nil {
			return err
		}
		if err := AssertPDFResponse(download); err != nil {
			return err
		}
		result = download.Body
		return nil
	})
	return result, err
}

func (c *Client) postPDFStep(ctx context.Context, path string, form url.Values) (*httpclient.Response, error) {
	response, err := c.transport.PostForm(ctx, path+"?gnmkdm=N558020", form,
		c.transport.BaseURL()+path, httpclient.EffectDownload)
	if err != nil {
		return nil, err
	}
	if err := AssertReadableResponse(response, "成绩总表生成"); err != nil {
		return nil, err
	}
	return response, nil
}

func (c *Client) resolveFileResponse(
	ctx context.Context,
	response *httpclient.Response,
) (*httpclient.Response, error) {
	if response.StatusCode < 300 || response.StatusCode >= 400 {
		return response, nil
	}
	if ClassifyResponse(response) == VerdictSessionExpired {
		return response, nil
	}
	location := response.Header.Get("Location")
	if location == "" {
		return response, nil
	}
	next, err := config.AssertSameOrigin(location, c.transport.BaseURL())
	if err != nil {
		return nil, err
	}
	return c.transport.GetFollowingSameOrigin(ctx, next, httpclient.EffectDownload)
}

func buildSchedulePDFBody(xnm, xqm, name string) url.Values {
	return url.Values{
		"xm": {name}, "xnm": {xnm}, "xqm": {xqm},
		"xnmc": {domain.AcademicYearName(xnm)}, "xqmmc": {domain.DisplaySemester(xqm)},
		"jgmc": {"undefined"}, "xxdm": {""},
		"xszd.sj": {"true"}, "xszd.cd": {"true"}, "xszd.js": {"true"}, "xszd.jszc": {"false"},
		"xszd.jxb": {"true"}, "xszd.xkbz": {"true"}, "xszd.kcxszc": {"true"},
		"xszd.zhxs": {"true"}, "xszd.zxs": {"true"}, "xszd.khfs": {"true"},
		"xszd.xf": {"true"}, "xszd.skfsmc": {"false"}, "kzlx": {"dy"},
	}
}

func academiaPDFData() url.Values {
	return url.Values{
		"gsdygx": {"10628-zw-mrgs"}, "ids": {""}, "bdykcxzDms": {""}, "cytjkcxzDms": {""},
		"cytjkclbDms": {""}, "cytjkcgsDms": {""}, "bjgbdykcxzDms": {""},
		"bjgbdyxxkcxzDms": {""}, "djksxmDms": {""}, "cjbzmcDms": {""}, "cjdySzxs": {""},
	}
}
