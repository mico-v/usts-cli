package documentstore

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
)

type FileStore struct{}

func (FileStore) Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (FileStore) Write(path string, data []byte) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", domain.WrapError(domain.CodeFileSystem, "无法解析输出路径："+path, err)
	}
	temp := fmt.Sprintf("%s.tmp-%d-%d", absolute, os.Getpid(), time.Now().UnixNano())
	file, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if err := replaceFile(temp, absolute); err != nil {
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	_ = os.Chmod(absolute, 0o600)
	return absolute, nil
}

func replaceFile(temp, destination string) error {
	if err := os.Rename(temp, destination); err == nil {
		return nil
	} else if runtime.GOOS != "windows" {
		return err
	}
	if err := os.Remove(destination); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(temp, destination)
}
