package sessionstore

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/atomicfile"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const maxSessionBytes = 1024 * 1024

type PersistedSession struct {
	SchemaVersion int                       `json:"schemaVersion"`
	Origin        string                    `json:"origin"`
	Cookies       []httpclient.StoredCookie `json:"cookies"`
	Username      string                    `json:"username,omitempty"`
	LoginTime     string                    `json:"loginTime,omitempty"`
}

type Store interface {
	Load() (*PersistedSession, error)
	Save(session PersistedSession) error
	Remove() (bool, error)
}

type FileStore struct {
	Path string
}

func New(path string) *FileStore {
	return &FileStore{Path: path}
}

func (s *FileStore) Load() (*PersistedSession, error) {
	unlock, err := acquireStoreLock(s.Path)
	if err != nil {
		if _, statErr := os.Stat(s.Path); statErr != nil {
			return nil, nil
		}
	} else {
		defer unlock()
	}
	info, err := os.Lstat(s.Path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, nil
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() > maxSessionBytes {
		return nil, nil
	}
	if !secureSessionFile(info) {
		return nil, nil
	}
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return nil, nil
	}
	var session PersistedSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, nil
	}
	if session.SchemaVersion != 1 || session.Origin == "" || session.Cookies == nil {
		return nil, nil
	}
	return &session, nil
}

func (s *FileStore) Save(session PersistedSession) error {
	directory := filepath.Dir(s.Path)
	if info, statErr := os.Lstat(directory); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		return domain.NewError(domain.CodeFileSystem, "拒绝向符号链接目录保存会话："+directory)
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return domain.WrapError(domain.CodeFileSystem, "无法创建会话目录："+directory, err)
	}
	unlock, err := acquireStoreLock(s.Path)
	if err != nil {
		return domain.WrapError(domain.CodeFileSystem, "无法锁定会话存储", err)
	}
	defer unlock()
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return domain.WrapError(domain.CodeFileSystem, "无法序列化会话", err)
	}
	temp := fmt.Sprintf("%s.tmp-%d-%d", s.Path, os.Getpid(), time.Now().UnixNano())
	file, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return domain.WrapError(domain.CodeFileSystem, "无法安全保存会话："+s.Path, err)
	}
	cleanup := func() {
		_ = file.Close()
		_ = os.Remove(temp)
	}
	if _, err := file.Write(data); err != nil {
		cleanup()
		return domain.WrapError(domain.CodeFileSystem, "无法安全保存会话："+s.Path, err)
	}
	if err := file.Sync(); err != nil {
		cleanup()
		return domain.WrapError(domain.CodeFileSystem, "无法安全保存会话："+s.Path, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(temp)
		return domain.WrapError(domain.CodeFileSystem, "无法安全保存会话："+s.Path, err)
	}
	if err := atomicfile.Replace(temp, s.Path); err != nil {
		_ = os.Remove(temp)
		return domain.WrapError(domain.CodeFileSystem, "无法安全保存会话："+s.Path, err)
	}
	_ = os.Chmod(s.Path, 0o600)
	return nil
}

func (s *FileStore) Remove() (bool, error) {
	unlock, err := acquireStoreLock(s.Path)
	if err != nil {
		if _, statErr := os.Stat(filepath.Dir(s.Path)); errors.Is(statErr, os.ErrNotExist) {
			return false, nil
		}
		return false, domain.WrapError(domain.CodeFileSystem, "无法锁定会话存储", err)
	}
	defer unlock()
	err = os.Remove(s.Path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, domain.WrapError(domain.CodeFileSystem, "无法删除会话文件："+s.Path, err)
	}
	return true, nil
}
