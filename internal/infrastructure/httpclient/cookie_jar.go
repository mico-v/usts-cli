package httpclient

import (
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

type StoredCookie struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	Domain    string `json:"domain"`
	Path      string `json:"path"`
	HostOnly  bool   `json:"hostOnly"`
	Secure    bool   `json:"secure"`
	ExpiresAt int64  `json:"expiresAt,omitempty"`
}

type CookieJar struct {
	mu         sync.Mutex
	defaultURL string
	cookies    map[string]StoredCookie
}

func NewCookieJar(defaultURL string) *CookieJar {
	return &CookieJar{defaultURL: defaultURL, cookies: map[string]StoredCookie{}}
}

func (j *CookieJar) ImportCookieHeader(raw, requestURL string) {
	if requestURL == "" {
		requestURL = j.defaultURL
	}
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	for _, part := range strings.Split(raw, ";") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok || strings.TrimSpace(key) == "" {
			continue
		}
		cookie := StoredCookie{
			Name: strings.TrimSpace(key), Value: strings.TrimSpace(value),
			Domain: strings.ToLower(parsed.Hostname()), Path: "/", HostOnly: true,
			Secure: parsed.Scheme == "https",
		}
		j.cookies[cookieKey(cookie)] = cookie
	}
}

func (j *CookieJar) SetCookie(raw, requestURL string) bool {
	if requestURL == "" {
		requestURL = j.defaultURL
	}
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return false
	}
	response := &http.Response{Header: http.Header{"Set-Cookie": []string{raw}}}
	cookies := response.Cookies()
	if len(cookies) == 0 {
		return false
	}
	cookie := cookies[0]
	if cookie.Name == "" {
		return false
	}
	domain := strings.TrimPrefix(strings.ToLower(cookie.Domain), ".")
	hostOnly := domain == ""
	if domain == "" {
		domain = strings.ToLower(parsed.Hostname())
	}
	if !domainMatches(strings.ToLower(parsed.Hostname()), StoredCookie{Domain: domain, HostOnly: hostOnly}) {
		return false
	}
	path := cookie.Path
	if path == "" || !strings.HasPrefix(path, "/") {
		path = defaultCookiePath(parsed.Path)
	}
	expiresAt := int64(0)
	now := time.Now()
	if cookie.MaxAge < 0 {
		expiresAt = 1
	} else if cookie.MaxAge > 0 {
		expiresAt = now.Add(time.Duration(cookie.MaxAge) * time.Second).UnixMilli()
	} else if !cookie.Expires.IsZero() {
		expiresAt = cookie.Expires.UnixMilli()
	}
	stored := StoredCookie{
		Name: cookie.Name, Value: cookie.Value, Domain: domain, Path: path,
		HostOnly: hostOnly, Secure: cookie.Secure, ExpiresAt: expiresAt,
	}
	key := cookieKey(stored)

	j.mu.Lock()
	defer j.mu.Unlock()
	if expiresAt > 0 && expiresAt <= now.UnixMilli() {
		changed := j.deleteByNameLocked(stored.Domain, stored.Name)
		delete(j.cookies, key)
		return changed
	}
	previous, exists := j.cookies[key]
	j.cookies[key] = stored
	return !exists || previous != stored
}

func (j *CookieJar) Header(requestURL string) string {
	if requestURL == "" {
		requestURL = j.defaultURL
	}
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return ""
	}
	now := time.Now().UnixMilli()
	j.mu.Lock()
	defer j.mu.Unlock()
	var matches []StoredCookie
	for key, cookie := range j.cookies {
		if cookie.ExpiresAt > 0 && cookie.ExpiresAt <= now {
			delete(j.cookies, key)
			continue
		}
		if cookie.Secure && parsed.Scheme != "https" {
			continue
		}
		if !domainMatches(strings.ToLower(parsed.Hostname()), cookie) || !pathMatches(parsed.Path, cookie.Path) {
			continue
		}
		matches = append(matches, cookie)
	}
	sort.SliceStable(matches, func(i, k int) bool {
		if len(matches[i].Path) == len(matches[k].Path) {
			return matches[i].Name < matches[k].Name
		}
		return len(matches[i].Path) > len(matches[k].Path)
	})
	parts := make([]string, 0, len(matches))
	for _, cookie := range matches {
		parts = append(parts, cookie.Name+"="+cookie.Value)
	}
	return strings.Join(parts, "; ")
}

func (j *CookieJar) Serialize() []StoredCookie {
	j.mu.Lock()
	defer j.mu.Unlock()
	now := time.Now().UnixMilli()
	cookies := make([]StoredCookie, 0, len(j.cookies))
	for key, cookie := range j.cookies {
		if cookie.ExpiresAt > 0 && cookie.ExpiresAt <= now {
			delete(j.cookies, key)
			continue
		}
		cookies = append(cookies, cookie)
	}
	sort.SliceStable(cookies, func(i, k int) bool {
		if cookies[i].Domain == cookies[k].Domain {
			if cookies[i].Path == cookies[k].Path {
				return cookies[i].Name < cookies[k].Name
			}
			return cookies[i].Path < cookies[k].Path
		}
		return cookies[i].Domain < cookies[k].Domain
	})
	return cookies
}

func (j *CookieJar) Restore(raw []byte) {
	var cookies []StoredCookie
	if err := json.Unmarshal(raw, &cookies); err == nil {
		j.mu.Lock()
		defer j.mu.Unlock()
		for _, cookie := range cookies {
			if cookie.Name == "" || cookie.Domain == "" || cookie.Path == "" {
				continue
			}
			cookie.Domain = strings.ToLower(cookie.Domain)
			j.cookies[cookieKey(cookie)] = cookie
		}
		return
	}
	var pairs [][2]string
	if err := json.Unmarshal(raw, &pairs); err == nil {
		for _, pair := range pairs {
			j.ImportCookieHeader(pair[0]+"="+pair[1], j.defaultURL)
		}
	}
}

func (j *CookieJar) Size() int {
	j.mu.Lock()
	defer j.mu.Unlock()
	return len(j.cookies)
}

func (j *CookieJar) Clear() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.cookies = map[string]StoredCookie{}
}

func (j *CookieJar) deleteByNameLocked(domain, name string) bool {
	changed := false
	for key, cookie := range j.cookies {
		if cookie.Domain == domain && cookie.Name == name {
			delete(j.cookies, key)
			changed = true
		}
	}
	return changed
}

func cookieKey(cookie StoredCookie) string {
	return cookie.Domain + "\n" + cookie.Path + "\n" + cookie.Name
}

func domainMatches(host string, cookie StoredCookie) bool {
	if cookie.HostOnly {
		return host == cookie.Domain
	}
	return host == cookie.Domain || strings.HasSuffix(host, "."+cookie.Domain)
}

func pathMatches(requestPath, cookiePath string) bool {
	if requestPath == "" {
		requestPath = "/"
	}
	if requestPath == cookiePath {
		return true
	}
	if !strings.HasSuffix(cookiePath, "/") {
		cookiePath += "/"
	}
	return strings.HasPrefix(requestPath, cookiePath)
}

func defaultCookiePath(path string) string {
	if path == "" || path == "/" {
		return "/"
	}
	index := strings.LastIndex(path, "/")
	if index <= 0 {
		return "/"
	}
	return path[:index]
}
