package config

import (
	"bufio"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

const (
	DefaultBaseURL = "https://jwgl.usts.edu.cn/jwglxt"
	trustedHost    = "jwgl.usts.edu.cn"
)

var privilegedKeys = map[string]bool{
	"USTS_ALLOW_CUSTOM_HOST":   true,
	"USTS_ALLOW_INSECURE_HTTP": true,
}

type Credentials struct {
	Username string
	Password string
}

type Runtime struct {
	Values   map[string]string
	Launch   map[string]string
	BaseURL  string
	EnvFile  string
	Rejected []string
	Warnings []string
}

func CurrentEnvironment() map[string]string {
	values := make(map[string]string)
	for _, item := range os.Environ() {
		key, value, ok := strings.Cut(item, "=")
		if ok {
			values[key] = value
		}
	}
	return values
}

func Load() (*Runtime, error) {
	launch := CurrentEnvironment()
	values := cloneMap(launch)
	explicit := launch["USTS_ENV_FILE"]
	envFile := EnvFilePath(launch)
	if explicit != "" {
		absolute, err := filepath.Abs(explicit)
		if err != nil {
			return nil, domain.ConfigError("USTS_ENV_FILE 路径无效：%s", explicit)
		}
		envFile = absolute
	}
	rejected, err := loadEnvFile(envFile, values)
	if err != nil {
		return nil, err
	}
	baseURL, err := NormalizeBaseURL(valueOr(values["USTS_BASE_URL"], DefaultBaseURL), launch)
	if err != nil {
		return nil, err
	}
	runtimeConfig := &Runtime{
		Values:   values,
		Launch:   launch,
		BaseURL:  baseURL,
		EnvFile:  envFile,
		Rejected: rejected,
	}
	runtimeConfig.Warnings = configWarnings(runtimeConfig)
	return runtimeConfig, nil
}

func NormalizeBaseURL(raw string, launch map[string]string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		return "", domain.ConfigError("USTS_BASE_URL 不是有效 URL：%s", raw)
	}
	if parsed.User != nil {
		return "", domain.ConfigError("USTS_BASE_URL 不能包含用户名或密码")
	}
	allowCustomHost := launch["USTS_ALLOW_CUSTOM_HOST"] == "1"
	allowInsecure := launch["USTS_ALLOW_INSECURE_HTTP"] == "1"
	if parsed.Scheme != "https" && !allowInsecure {
		return "", domain.ConfigError("教务系统地址必须使用 HTTPS；开发环境需显式设置 USTS_ALLOW_INSECURE_HTTP=1")
	}
	if !strings.EqualFold(parsed.Hostname(), trustedHost) && !allowCustomHost {
		return "", domain.ConfigError(
			"拒绝向未信任主机 %s 发送凭证；如确为开发环境，请显式设置 USTS_ALLOW_CUSTOM_HOST=1（该开关只能来自环境变量，不能写在配置文件里）",
			parsed.Hostname(),
		)
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return parsed.String(), nil
}

func AssertSameOrigin(raw, baseURL string) (string, error) {
	base, err := url.Parse(baseURL)
	if err != nil {
		return "", domain.WrapError(domain.CodeConfiguration, "当前教务系统地址无效", err)
	}
	reference, err := url.Parse(baseURL + "/")
	if err != nil {
		return "", domain.WrapError(domain.CodeConfiguration, "当前教务系统地址无效", err)
	}
	target, err := reference.Parse(raw)
	if err != nil {
		return "", domain.WrapError(domain.CodeProtocolChanged, "服务端返回了无效的下载地址", err)
	}
	if base.Scheme == "https" && target.Scheme != "https" {
		return "", domain.NewError(domain.CodeProtocolChanged, "服务端返回了不安全的 HTTP 下载地址")
	}
	if !strings.EqualFold(target.Scheme, base.Scheme) || !strings.EqualFold(target.Host, base.Host) {
		return "", domain.NewError(domain.CodeProtocolChanged, fmt.Sprintf("拒绝携带会话 Cookie 访问跨源下载地址：%s://%s", target.Scheme, target.Host))
	}
	return target.String(), nil
}

func (r *Runtime) Credentials() *Credentials {
	username := strings.TrimSpace(r.Values["USTS_USERNAME"])
	password := r.Values["USTS_PASSWORD"]
	if username == "" || password == "" {
		return nil
	}
	return &Credentials{Username: username, Password: password}
}

func (r *Runtime) SessionTrustMillis() int64 {
	raw := strings.TrimSpace(r.Values["USTS_SESSION_TRUST_MS"])
	if raw == "" {
		return 5 * 60 * 1000
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 0 {
		return 5 * 60 * 1000
	}
	return value
}

func loadEnvFile(path string, values map[string]string) ([]string, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, domain.WrapError(domain.CodeConfiguration, "无法读取配置文件："+path, err)
	}
	defer file.Close()

	var rejected []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '\'' && value[len(value)-1] == '\'') || (value[0] == '"' && value[len(value)-1] == '"') {
				value = value[1 : len(value)-1]
			}
		}
		if privilegedKeys[key] {
			rejected = append(rejected, key)
			continue
		}
		if _, exists := values[key]; !exists {
			values[key] = value
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, domain.WrapError(domain.CodeConfiguration, "无法读取配置文件："+path, err)
	}
	return rejected, nil
}

var ustsConfigLine = regexp.MustCompile(`(?m)^\s*USTS_[A-Z0-9_]+\s*=`)

func configWarnings(runtimeConfig *Runtime) []string {
	var warnings []string
	if info, err := os.Stat(runtimeConfig.EnvFile); err == nil && info.Mode().Perm()&0o077 != 0 {
		warnings = append(warnings, fmt.Sprintf("配置文件权限为 %o，建议执行 chmod 600 %s", info.Mode().Perm(), runtimeConfig.EnvFile))
	}
	cwd, _ := os.Getwd()
	stale := filepath.Join(cwd, ".env")
	if stale == runtimeConfig.EnvFile {
		return warnings
	}
	if info, err := os.Stat(stale); err == nil && info.Size() <= 64*1024 {
		if content, err := os.ReadFile(stale); err == nil && ustsConfigLine.Match(content) {
			warnings = append(warnings, fmt.Sprintf(
				"未读取 %s：配置文件现在只在 %s 查找（也可用 USTS_ENV_FILE 显式指定）。请把文件移到该位置。",
				stale, runtimeConfig.EnvFile,
			))
		}
	}
	return warnings
}

func cloneMap(source map[string]string) map[string]string {
	clone := make(map[string]string, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func valueOr(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
