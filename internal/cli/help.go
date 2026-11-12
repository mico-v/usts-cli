package cli

import (
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

type helpTopic struct {
	Name    string
	Aliases []string
	Summary string
	Text    string
}

var helpTopics = []helpTopic{
	{
		Name: "config", Aliases: []string{"配置"}, Summary: "配置文件位置、可用键与网络信任边界",
		Text: `配置

  配置文件放在用户配置目录下的 .env，不是当前目录：

    Linux    ${XDG_CONFIG_HOME:-~/.config}/usts-cli/.env
    macOS    ~/Library/Application Support/usts-cli/.env
    Windows  %APPDATA%\usts-cli\.env

  用 USTS_CONFIG_DIR 覆盖目录，或用 USTS_ENV_FILE=/path/to/.env 直接指定文件。

  可配置项:
    USTS_BASE_URL   教务系统地址，缺省 https://jwgl.usts.edu.cn/jwglxt
    USTS_USERNAME   学号
    USTS_PASSWORD   密码
    USTS_COOKIES    直接注入浏览器复制的 Cookie
    USTS_STATE_DIR  覆盖会话状态目录

  真实环境变量优先于文件内容。出于凭证安全，默认只允许 HTTPS 的
  jwgl.usts.edu.cn。开发环境如需自定义主机，必须显式设置
  USTS_ALLOW_CUSTOM_HOST=1；明文 HTTP 还需 USTS_ALLOW_INSECURE_HTTP=1。
  这两个开关只认真实环境变量，写在配置文件里会被忽略。`,
	},
	{
		Name: "session", Aliases: []string{"会话", "登录"}, Summary: "登录方式、会话有效期、自动重登与敏感度",
		Text: `登录与会话

  首次使用先运行 usts login，会话会持久化到用户状态目录。之后查询命令直接复用。

  登录流程按优先级自动选择:
    1. 已有有效会话
    2. USTS_COOKIES 注入的浏览器 Cookie（只探测，不自动重登）
    3. USTS_USERNAME/USTS_PASSWORD 账号密码登录

  查询命令默认在 5 分钟信任窗口内直接复用；窗口过期后发一次探针请求。
  探针明确失效时，使用配置中的凭据自动重新登录并重放一次。网络异常判为
  unknown，不会误触发重新登录。恢复是单飞的，失败后进入 60 秒冷却期。

  会话文件是明文 bearer token，效力等同于密码。usts logout 只清理本地文件
  与内存 Cookie，不发网络请求。`,
	},
	{
		Name: "term", Aliases: []string{"学期"}, Summary: "学期参数的取值、缺省推算与全部学期",
		Text: `学期参数

  scores / exams / courses / schedule / clsched / selected-courses / freeclass /
  payment / minor-schedule / schedule-pdf 支持:

    -y, --xnm <学年>   学年，如 2025
    -t, --xqm <学期>   3=第一学期, 12=第二学期, 16=第三学期

  缺省时按当前日期推算。只给 -y 而不给 -t 时，学期留空表示该学年全部学期。`,
	},
	{
		Name: "json", Aliases: []string{"输出", "退出码"}, Summary: "--json 输出信封与退出码",
		Text: `JSON 输出与退出码

  查询命令支持 --json，成功输出:

    {"schemaVersion":1,"command":"scores","data":[...],"meta":{...},"warnings":[]}

  错误写到 stderr，同样是版本化信封。退出码:
    0 成功
    2 配置或参数错误
    3 登录、会话、凭证或验证码问题
    4 网络、限流或远端服务错误
    5 远端协议/响应结构变化
    6 本地文件系统错误`,
	},
	{
		Name: "download", Aliases: []string{"下载", "pdf"}, Summary: "PDF 下载的文件名与覆盖策略",
		Text: `PDF 下载（只读）

  usts schedule-pdf -y 2026 -t 3  → schedule-2026-3.pdf
  usts academia-pdf               → transcript.pdf

  默认拒绝覆盖已有文件，加 --force 才覆盖。下载链校验同源跳转与 %PDF- 文件头。
  PDF 含个人课表、成绩与学籍信息，请自行选择安全的输出路径。`,
	},
	{
		Name: "faq", Aliases: []string{"常见问题", "排错"}, Summary: "超时、WAF 限流、验证码与空结果",
		Text: `常见问题

  未找到会话：运行 usts login。
  会话已失效：检查 .env 中的账号密码，或重新运行 usts login。
  请求超时：普通请求 15 秒、下载 45 秒；程序会换连接重试并打印提示。
  连接被重置：通常是 WAF 限流，请等待 30~60 秒。
  需要验证码：改用 USTS_COOKIES 注入浏览器 Cookie。
  查询为空：用 -y / -t 显式指定学期后重试。`,
	},
}

func WriteRootHelp(writer io.Writer, version string) {
	fmt.Fprintf(writer, `苏州科技大学教务系统（正方 V9）命令行工具（只读查询）

版本: %s

用法:
  usts <命令> [选项]
  usts help [主题]
  usts

命令:
`, version)
	for _, spec := range Commands() {
		fmt.Fprintf(writer, "  %-18s %s\n", spec.Name, spec.Summary)
	}
	fmt.Fprintf(writer, "  %-18s %s\n", "help", "查看详细文档或命令帮助")
	fmt.Fprintf(writer, "  %-18s %s\n", "version", "显示版本")
	fmt.Fprintln(writer, `
通用学期参数:
  -y, --xnm <学年>   学年，如 2025
  -t, --xqm <学期>   3=第一学期, 12=第二学期, 16=第三学期

详细文档:`)
	for _, topic := range helpTopics {
		fmt.Fprintf(writer, "  usts help %-10s %s\n", topic.Name, topic.Summary)
	}
	fmt.Fprintln(writer, "  也可以 usts help <命令>（等同于 usts <命令> --help）")
	fmt.Fprintln(writer, "\n不带任何子命令运行 usts 会进入交互式菜单（需要真实终端）。")
	fmt.Fprintln(writer, "交互菜单支持 ↑/↓、j/k、Ctrl+P/Ctrl+N、PgUp/PgDn、Home/End、数字键跳选和 Ctrl+C 退出。")
}

func WriteCommandHelp(writer io.Writer, spec CommandSpec) {
	fmt.Fprintf(writer, "用法:\n  usts %s [选项]\n\n%s\n", spec.Name, spec.Summary)
	if spec.Help != "" {
		fmt.Fprintf(writer, "\n%s\n", strings.TrimSpace(spec.Help))
	}
	fmt.Fprintln(writer, "\n选项:")
	if spec.Term {
		fmt.Fprintln(writer, "  -y, --xnm <学年>   学年，如 2025")
		fmt.Fprintln(writer, "  -t, --xqm <学期>   3=第一学期, 12=第二学期, 16=第三学期")
	}
	for _, option := range spec.OptionsHelp {
		fmt.Fprintln(writer, "  "+option)
	}
	if !spec.HideJSON {
		fmt.Fprintln(writer, "  --json             以 JSON 输出")
	}
	fmt.Fprintln(writer, "  -h, --help         显示帮助")
}

func RunHelp(app *App, topic string) error {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		WriteRootHelp(app.Out, app.Version)
		return nil
	}
	if spec, ok := FindCommand(topic); ok {
		WriteCommandHelp(app.Out, spec)
		return nil
	}
	for _, item := range helpTopics {
		if item.Name == topic || contains(item.Aliases, topic) {
			fmt.Fprintln(app.Out, item.Text)
			return nil
		}
	}
	names := make([]string, 0, len(helpTopics))
	for _, item := range helpTopics {
		names = append(names, item.Name)
	}
	sort.Strings(names)
	return domain.ConfigError("没有这个帮助主题：%s。可用主题：%s，或直接写命令名（如 usts help scores）", topic, strings.Join(names, " / "))
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
